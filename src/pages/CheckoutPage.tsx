import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";

/**
 * CheckoutPage.tsx — Deluxe Embedded Payments (with Hosted Links fallback)
 *
 * - Ensures/creates a Firestore orders/{orderId} with status "pending"
 * - Loads Deluxe Embedded Payments SDK (sandbox vs prod decided by backend hint)
 * - Requests a short-lived JWT from /api/createEmbeddedJwt
 * - Initializes & renders the embedded payment panel into #embeddedpayments
 * - Registers SDK event handlers for immediate UX feedback
 * - Listens to Firestore order doc to flip UI when webhook marks status "paid"
 * - If embedded init fails or is disabled, falls back to /api/createDeluxePayment (hosted link)
 *
 * IMPORTANT:
 * - Amounts are currency UNITS (e.g., 200 means $200.00), not cents.
 * - Do NOT expose any Deluxe secrets here (JWT is signed by backend only).
 */

// Types align with our project docs
type Level3Item = {
  skuCode?: string;
  name?: string;
  description?: string;
  quantity: number;
  price: number;
  unitOfMeasure?: string;
};

type OrderCustomer = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  billingAddress?: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    countryCode?: string;
  };
};

type BookingDates = string[];

type Booking = {
  dates?: BookingDates;
  numberOfHunters?: number;
  partyDeck?: boolean;
  lineItems?: Level3Item[];
};

type OrderDoc = {
  status?: "pending" | "paid" | "cancelled";
  total?: number; // currency units
  currency?: "USD" | "CAD"; // default USD
  booking?: Booking | null;
  merchItems?: Level3Item[];
  customer?: OrderCustomer;
  createdAt?: any;
  updatedAt?: any;
  deluxe?: {
    lastEmbeddedInit?: any;
    lastEmbeddedError?: any;
    linkId?: string | null;
    paymentUrl?: string | null;
    paymentId?: string | null;
    lastPaymentLinkRequest?: any;
    lastPaymentLinkResponse?: any;
    lastWebhook?: any;
  };
};

declare global {
  interface Window {
    EmbeddedPayments?: any;
  }
}

const SDK_URLS = {
  sandbox: "https://payments2.deluxe.com/embedded/javascripts/deluxe.js",
  production: "https://payments.deluxe.com/embedded/javascripts/deluxe.js",
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const tag = document.createElement("script");
    tag.src = src;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(tag);
  });
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  // Your CartContext should expose these (adjust names if needed)
  const { cart, total, level3Items, clearCart } = useCart();
  const { user } = useAuth();

  const [orderId, setOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<OrderDoc["status"]>("pending");
  const [envHint, setEnvHint] = useState<"sandbox" | "production">("sandbox");

  const containerRef = useRef<HTMLDivElement | null>(null);

  const currency: "USD" | "CAD" = useMemo(() => "USD", []);
  const customer: OrderCustomer = useMemo(() => {
    const nameParts = (user?.displayName || "").trim().split(/\s+/);
    return {
      firstName: nameParts[0] || "Guest",
      lastName: nameParts.slice(1).join(" ") || "Customer",
      email: user?.email || undefined,
    };
  }, [user]);

  // Ensure/merge an order document in Firestore
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // Deterministic client-side ID for this session (server/webhook remain source of truth)
        const seededId =
          cart?.orderId ||
          `ord_${Math.random().toString(36).slice(2)}_${Date.now()}`;

        const orderRef = doc(db, "orders", seededId);
        const snap = await getDoc(orderRef);

        const orderPayload: OrderDoc = {
          status: "pending",
          total: Number(total || 0),
          currency,
          booking: cart?.booking || null,
          merchItems: Array.isArray(cart?.merchItems) ? cart.merchItems : [],
          customer,
          updatedAt: serverTimestamp(),
          ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
        };

        await setDoc(orderRef, orderPayload, { merge: true });
        setOrderId(seededId);

        // Listen to order status changes (webhook authoritative)
        const unsub = onSnapshot(orderRef, (docSnap) => {
          const data = docSnap.data() as OrderDoc | undefined;
          if (data?.status) setStatus(data.status);
          if (data?.status === "paid") {
            clearCart();
            // navigate("/success"); // enable if you have a success route
          }
        });

        return () => unsub();
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Failed to prepare order");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize Embedded Payments after order is ready
  useEffect(() => {
    if (!orderId || loading || status === "paid") return;

    let disposed = false;

    (async () => {
      try {
        // Ask backend to mint a short-lived Embedded JWT
        const jwtResp = await fetch("/api/createEmbeddedJwt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            amount: Number(total || 0), // currency units
            currency: currency,
            customer,
            products: Array.isArray(level3Items) ? level3Items : [],
          }),
        });

        if (!jwtResp.ok) {
          const t = await jwtResp.text();
          throw new Error(`createEmbeddedJwt failed: ${t || jwtResp.status}`);
        }

        const { jwt, env } = (await jwtResp.json()) as {
          jwt: string;
          env: "sandbox" | "production";
        };

        setEnvHint(env);

        // Load appropriate Deluxe SDK based on env hint
        await loadScript(SDK_URLS[env || "sandbox"]);

        if (!window.EmbeddedPayments) {
          throw new Error("Deluxe EmbeddedPayments SDK not found on window");
        }

        // Initialize + handlers + render
        await window.EmbeddedPayments.init(jwt, {
          countryCode: "US",
          currencyCode: currency,
          paymentMethods: ["cc"], // enable ACH only if your MID supports it
          supportedNetworks: ["visa", "masterCard", "amex", "discover"],
        }).setEventHandlers({
          onTxnSuccess: (data: any) => {
            console.info("[Deluxe] onTxnSuccess", data);
            // Webhook will still be the truth to flip order-> paid
          },
          onTxnFailed: (data: any) => {
            console.warn("[Deluxe] onTxnFailed", data);
            setError("Payment failed. Please try again or use the fallback.");
          },
          onTxnCancelled: (data: any) => {
            console.info("[Deluxe] onTxnCancelled", data);
          },
          onValidationError: (data: any) => {
            console.warn("[Deluxe] onValidationError", data);
          },
        });

        if (disposed) return;
        await window.EmbeddedPayments.render({
          containerId: "embeddedpayments",
          paymentpanelstyle: "light",
        });
      } catch (err: any) {
        console.error("[Embedded] init error", err);
        setError(err?.message || "Embedded init failed");
        // Fallback to Hosted Checkout if embedded fails
        try {
          const successUrl = window.location.origin + "/checkout/success";
          const cancelUrl = window.location.origin + "/checkout";
          const resp = await fetch("/api/createDeluxePayment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, successUrl, cancelUrl }),
          });
          const json = await resp.json();
          if (!resp.ok || !json?.paymentUrl) {
            throw new Error(json?.error || "Hosted link failed");
          }
          window.location.href = json.paymentUrl as string;
        } catch (fallbackErr: any) {
          console.error("[Hosted fallback] error", fallbackErr);
          setError(fallbackErr?.message || "Unable to start hosted checkout");
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [orderId, loading, status, total, currency, customer, level3Items]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>

      <div className="mt-2 text-sm opacity-70">
        Environment: <span className="font-mono">{envHint}</span>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {error}
        </div>
      )}

      {status === "paid" ? (
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="font-medium">
            Payment complete. Your booking is confirmed.
          </p>
          <button
            className="mt-3 inline-flex items-center rounded-xl border border-white/10 px-4 py-2 hover:bg-white/5"
            onClick={() => navigate("/dashboard")}
          >
            Go to Dashboard
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-5">
          <div className="md:col-span-3">
            <div className="rounded-2xl border border-white/10 p-4">
              <h2 className="text-lg font-medium">Payment</h2>
              <div
                id="embeddedpayments"
                ref={containerRef}
                className="mt-3 min-h-[360px]"
              />
              <p className="mt-3 text-xs opacity-70">
                If the panel fails to load, we’ll automatically switch to a
                secure hosted checkout page.
              </p>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="rounded-2xl border border-white/10 p-4">
              <h2 className="text-lg font-medium">Order Summary</h2>
              <div className="mt-2 text-sm opacity-80">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${Number(total || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>–</span>
                </div>
                <div className="mt-2 border-t border-white/10 pt-2 flex justify-between font-semibold">
                  <span>Total</span>
                  <span>${Number(total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
