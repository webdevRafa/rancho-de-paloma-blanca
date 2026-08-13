import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import "./PendingOrderPaymentPage.css";

type EPApi = {
  init: (jwt: string, config: Record<string, unknown>) => unknown;
  setEventHandlers?: (
    map: Record<string, (gateway: unknown, data: unknown) => void>
  ) => unknown;
  render: (options: { containerId: string } & Record<string, unknown>) => void;
  destroy?: () => void;
};

type OrderSummary = {
  orderId: string;
  status?: string;
  total: number;
  currency: string;
  createdAt?: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
  };
  booking: {
    dates: string[];
    numberOfHunters: number;
    partyDeckDates: string[];
    attendees: Array<{ fullName: string; email?: string }>;
  } | null;
  merchItems: Array<{ name: string; quantity: number; price: number }>;
};

type SessionResponse = {
  jwt: string;
  embeddedBase: string;
  order: OrderSummary;
};

type PageState =
  | "loading"
  | "ready"
  | "processing"
  | "error"
  | "unavailable"
  | "already-paid";

const CONTAINER_ID = "pending-order-embedded-payments";

function resolveEmbeddedPayments(): EPApi | undefined {
  const paymentWindow = window as typeof window & {
    EmbeddedPayments?: EPApi;
    Deluxe?: { EmbeddedPayments?: EPApi };
    deluxe?: { EmbeddedPayments?: EPApi };
  };
  if (paymentWindow.EmbeddedPayments) return paymentWindow.EmbeddedPayments;
  if (paymentWindow.Deluxe?.EmbeddedPayments) {
    return paymentWindow.Deluxe.EmbeddedPayments;
  }
  if (paymentWindow.deluxe?.EmbeddedPayments) {
    return paymentWindow.deluxe.EmbeddedPayments;
  }
  return undefined;
}

function loadDeluxeSdk(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${src}"]`
    ) as HTMLScriptElement | null;
    if (existing && resolveEmbeddedPayments()) {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("The secure payment form could not be loaded.")),
        { once: true }
      );
      return;
    }

    document
      .querySelectorAll('script[src*="deluxe.com/embedded/javascripts/deluxe.js"]')
      .forEach((element) => element.remove());

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("The secure payment form could not be loaded."));
    document.head.appendChild(script);
  });
}

async function waitForEmbeddedPayments(timeoutMs = 8_000): Promise<EPApi> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const api = resolveEmbeddedPayments();
    if (api) return api;
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }
  throw new Error("The secure payment form did not finish loading.");
}

function friendlyDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value);
}

function errorMessage(code: string, conflictDates: string[] = []) {
  const dates = conflictDates.map(friendlyDate).join(", ");
  switch (code) {
    case "capacity-unavailable":
      return `There is no longer enough space for this party${dates ? ` on ${dates}` : ""}. No payment was attempted.`;
    case "party-deck-unavailable":
      return `The Party Deck is no longer available${dates ? ` on ${dates}` : ""}. No payment was attempted.`;
    case "availability-unavailable":
    case "availability-check-failed":
    case "configuration-unavailable":
      return "We could not safely confirm live availability. No payment was attempted. Please try again shortly.";
    case "order-not-found":
      return "We could not find this order.";
    case "order-forbidden":
      return "This order is not connected to the account currently signed in.";
    case "order-not-payable":
      return "This order can no longer accept payment.";
    case "order-total-invalid":
    case "order-invalid":
      return "This order needs attention before payment. Please contact the ranch and reference the order number.";
    default:
      return "We could not start the secure payment form. Please try again.";
  }
}

export default function PendingOrderPaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [message, setMessage] = useState("");
  const [showSlowConfirmation, setShowSlowConfirmation] = useState(false);
  const instanceRef = useRef<EPApi | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    document.title = "Complete Payment | Rancho de Paloma Blanca";
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const waitForServerConfirmation = useCallback(async () => {
    if (!orderId) return;
    setPageState("processing");
    setShowSlowConfirmation(false);
    const slowTimer = window.setTimeout(() => {
      if (mountedRef.current) setShowSlowConfirmation(true);
    }, 12_000);

    try {
      while (mountedRef.current) {
        const snapshot = await getDoc(doc(db, "orders", orderId));
        if (snapshot.exists() && snapshot.get("status") === "paid") {
          navigate(`/dashboard?status=paid&orderId=${encodeURIComponent(orderId)}`);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      }
    } catch (error) {
      console.warn("Waiting for payment confirmation failed", error);
      if (mountedRef.current) setShowSlowConfirmation(true);
    } finally {
      window.clearTimeout(slowTimer);
    }
  }, [navigate, orderId]);

  const startPayment = useCallback(async () => {
    if (!user || !orderId) return;
    const attempt = ++attemptRef.current;
    setPageState("loading");
    setMessage("");
    setShowSlowConfirmation(false);

    try {
      instanceRef.current?.destroy?.();
      const idToken = await user.getIdToken();
      const response = await fetch("/api/createPendingOrderEmbeddedJwt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ orderId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data?.order) setOrder(data.order as OrderSummary);
        if (data?.error === "order-already-paid") {
          setPageState("already-paid");
          setMessage("This order has already been paid and confirmed.");
          return;
        }
        const unavailable = [
          "capacity-unavailable",
          "party-deck-unavailable",
          "availability-unavailable",
        ].includes(String(data?.error));
        setPageState(unavailable ? "unavailable" : "error");
        setMessage(errorMessage(String(data?.error || ""), data?.conflictDates));
        return;
      }

      if (attempt !== attemptRef.current || !mountedRef.current) return;
      const session = data as SessionResponse;
      setOrder(session.order);
      await loadDeluxeSdk(
        `${session.embeddedBase}/embedded/javascripts/deluxe.js`
      );
      const api = await waitForEmbeddedPayments();
      const merchantStatus: Record<string, unknown> = await fetch(
        "/api/getEmbeddedMerchantStatus"
      )
        .then((result) => (result.ok ? result.json() : {}))
        .catch(() => ({}));
      const paymentMethods: Array<"cc" | "ach"> = ["cc"];
      if (
        merchantStatus.achEnabled === true ||
        (Array.isArray(merchantStatus.methods) &&
          merchantStatus.methods.includes("ach"))
      ) {
        paymentMethods.push("ach");
      }

      const initialized = await api.init(session.jwt, {
        countryCode: "US",
        currencyCode: session.order.currency || "USD",
        paymentMethods,
        supportedNetworks: ["visa", "masterCard", "amex", "discover"],
        googlePayEnv: session.embeddedBase.includes("payments2.")
          ? "TEST"
          : "PRODUCTION",
        merchantCapabilities: ["supports3DS"],
        allowedCardAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
        hideApplePayButton: merchantStatus.applePayEnabled !== true,
        hideGooglePayButton: merchantStatus.googlePayEnabled !== true,
      });
      const host =
        initialized && typeof initialized === "object"
          ? (initialized as EPApi)
          : api;
      const handlerHost = host.setEventHandlers ? host : api;
      await Promise.resolve(
        handlerHost.setEventHandlers?.({
          onTxnSuccess: () => void waitForServerConfirmation(),
          onTxnFailed: () => {
            setPageState("ready");
            setMessage("Payment was not approved. Please review the payment details and try again.");
          },
          onTxnCancelled: () => {
            setPageState("ready");
            setMessage("Payment was cancelled. Your order is still unpaid.");
          },
          onValidationError: () => {
            setPageState("ready");
            setMessage("Please review the highlighted payment details.");
          },
          onCancel: () => {
            setPageState("ready");
            setMessage("Payment was cancelled. Your order is still unpaid.");
          },
        })
      );

      if (attempt !== attemptRef.current || !mountedRef.current) return;
      host.render({
        containerId: CONTAINER_ID,
        paymentpanelstyle: "light",
        walletsbgcolor: "#faf8f2",
        walletsborderadius: "8px",
        walletspadding: "12px",
        walletsgap: "8px",
        walletswidth: "100%",
        walletsfontcolor: "#23170f",
        paybuttoncolor: "#876426",
        cancelbuttoncolor: "#6b2d24",
      });
      instanceRef.current = host;
      setPageState("ready");
    } catch (error) {
      console.error("Unable to resume pending order payment", error);
      if (attempt === attemptRef.current && mountedRef.current) {
        setPageState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "We could not start the secure payment form."
        );
      }
    }
  }, [orderId, user, waitForServerConfirmation]);

  useEffect(() => {
    void startPayment();
    return () => {
      attemptRef.current += 1;
      instanceRef.current?.destroy?.();
    };
  }, [startPayment]);

  const attendeeCount = order?.booking?.attendees?.length || 0;
  const partyDeckDays = order?.booking?.partyDeckDates?.length || 0;

  return (
    <main className="pending-payment-page">
      <div className="pending-payment-shell">
        <Link to="/dashboard" className="pending-payment-back">
          <ArrowLeft aria-hidden="true" size={16} /> Back to your bookings
        </Link>

        <header className="pending-payment-heading">
          <div>
            <span className="pending-payment-kicker">
              <LockKeyhole aria-hidden="true" size={14} /> Secure checkout
            </span>
            <h1>Complete your payment</h1>
            <p>
              We’ll use the details already saved with this order. Availability
              is checked again before the payment form opens.
            </p>
          </div>
          {order && (
            <div className="pending-payment-reference">
              <span>Order reference</span>
              <strong>#{order.orderId}</strong>
            </div>
          )}
        </header>

        <div className="pending-payment-layout">
          <aside className="pending-payment-summary" aria-label="Order summary">
            <div className="pending-payment-summary__top">
              <span>Amount due</span>
              <strong>
                {order ? money(order.total, order.currency) : "—"}
              </strong>
            </div>

            {order?.booking && (
              <div className="pending-payment-details">
                <div>
                  <CalendarDays aria-hidden="true" size={18} />
                  <span>
                    <small>Hunt dates</small>
                    <strong>{order.booking.dates.length} selected</strong>
                  </span>
                </div>
                <ul>
                  {order.booking.dates.map((date) => (
                    <li key={date}>{friendlyDate(date)}</li>
                  ))}
                </ul>
                <div>
                  <Users aria-hidden="true" size={18} />
                  <span>
                    <small>Party</small>
                    <strong>
                      {order.booking.numberOfHunters} hunter
                      {order.booking.numberOfHunters === 1 ? "" : "s"}
                    </strong>
                  </span>
                </div>
                {attendeeCount > 0 && (
                  <p>{attendeeCount} attendee name{attendeeCount === 1 ? "" : "s"} saved</p>
                )}
                {partyDeckDays > 0 && (
                  <p className="pending-payment-deck">
                    Party Deck included for {partyDeckDays} day
                    {partyDeckDays === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            )}

            <div className="pending-payment-security">
              <ShieldCheck aria-hidden="true" size={19} />
              <p>
                <strong>Secure payment by Deluxe</strong>
                Your payment details are entered directly in Deluxe’s protected form.
              </p>
            </div>
          </aside>

          <section className="pending-payment-panel" aria-live="polite">
            {pageState === "loading" && (
              <div className="pending-payment-state">
                <RefreshCw className="pending-payment-spinner" aria-hidden="true" size={28} />
                <h2>Checking your order</h2>
                <p>Confirming availability and preparing secure payment…</p>
              </div>
            )}

            {pageState === "processing" && (
              <div className="pending-payment-state pending-payment-state--success">
                <CheckCircle2 aria-hidden="true" size={42} />
                <h2>Payment received</h2>
                <p>We’re confirming your reservation now. Please keep this page open.</p>
                {showSlowConfirmation && (
                  <button type="button" onClick={() => navigate("/dashboard") }>
                    Return to your bookings
                  </button>
                )}
              </div>
            )}

            {(pageState === "error" || pageState === "unavailable" || pageState === "already-paid") && (
              <div className="pending-payment-state pending-payment-state--error">
                {pageState === "already-paid" ? (
                  <CheckCircle2 aria-hidden="true" size={42} />
                ) : (
                  <AlertCircle aria-hidden="true" size={42} />
                )}
                <h2>
                  {pageState === "unavailable"
                    ? "Availability has changed"
                    : pageState === "already-paid"
                      ? "Payment already complete"
                      : "Payment form unavailable"}
                </h2>
                <p>{message}</p>
                <div className="pending-payment-state__actions">
                  {pageState === "error" && (
                    <button type="button" onClick={() => void startPayment()}>
                      Try again
                    </button>
                  )}
                  <Link to="/dashboard">Return to your bookings</Link>
                  {pageState === "unavailable" && <Link to="/contact">Contact the ranch</Link>}
                </div>
              </div>
            )}

            {pageState === "ready" && message && (
              <div className="pending-payment-notice" role="alert">
                <AlertCircle aria-hidden="true" size={17} /> {message}
              </div>
            )}
            <div
              id={CONTAINER_ID}
              className={pageState === "ready" ? "is-visible" : ""}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
