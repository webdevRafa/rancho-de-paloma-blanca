import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import CustomerInfoForm from "../components/CustomerInfoForm";
import { getSeasonConfig } from "../utils/getSeasonConfig";

export type CustomerInfo = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
};

/** Recursively remove any fields with value `undefined`. Firestore rejects `undefined` values. */
function pruneUndefinedDeep<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((v) => pruneUndefinedDeep(v)) as unknown as T;
  }
  if (
    obj &&
    typeof obj === "object" &&
    (obj as any).constructor?.name === "Object"
  ) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj as any)) {
      if (v === undefined) continue;
      out[k] = pruneUndefinedDeep(v as any);
    }
    return out as unknown as T;
  }
  return obj;
}

export type SeasonConfig = {
  seasonStart: string;
  seasonEnd: string;
  weekdayRate?: number;
  weekendRates?: {
    singleDay: number;
    twoConsecutiveDays: number;
    threeDayCombo: number;
  };
  partyDeckRatePerDay?: number;
};

// Extend the Window interface for the (optional) Deluxe SDK global.
declare global {
  interface Window {
    EmbeddedPayments?: any;
    deluxe?: any;
  }
}

// ---- Local Types (align with Types.ts / Order schema) ----
type BookingLine = {
  dates: string[];
  numberOfHunters: number;
  partyDeckDates?: string[];
  seasonConfig?: SeasonConfig;
};

type MerchItem = {
  skuCode: string;
  name: string;
  qty: number;
  price: number;
};

type OrderDoc = {
  userId: string;
  status: "pending" | "paid" | "cancelled";
  total: number;
  currency: "USD" | "CAD";
  createdAt?: any;
  updatedAt?: any;
  booking?: {
    userId: string;
    dates: string[];
    numberOfHunters: number;
    partyDeckDates?: string[];
    seasonConfig?: SeasonConfig;
    lineItems?: Array<{
      description: string;
      quantity: number;
      price: number;
      skuCode?: string;
      unitOfMeasure?: string;
    }>;
  } | null;
  merchItems?: Array<{
    skuCode: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  customer?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    billingAddress?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };
  deluxe?: {
    linkId?: string | null;
    paymentId?: string | null;
    paymentUrl?: string | null;
    createdAt?: any;
    updatedAt?: any;
    lastEvent?: any;
  };
};

const ORDER_ID_KEY = "rdpb:orderId";
const EMBEDDED_CONTAINER_ID = "embeddedpayments";

/**
 * Inject the Deluxe Embedded Payments SDK script. We **do not** wait for a UMD
 * global anymore (per Deluxe feedback). We just resolve on script load/error.
 */
function loadDeluxeSdk(src?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url =
      src || "https://payments2.deluxe.com/embedded/javascripts/deluxe.js";

    // Remove conflicting copies (e.g., prod vs sandbox)
    try {
      const all = Array.from(
        document.querySelectorAll(
          'script[src*="deluxe.com/embedded/javascripts/deluxe.js"]'
        )
      ) as HTMLScriptElement[];
      for (const s of all) {
        if (s.src !== url) s.parentElement?.removeChild(s);
      }
    } catch {}

    // If the exact script already exists, reuse its events.
    const existing = document.querySelector(
      `script[src="${url}"]`
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Deluxe SDK")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Deluxe SDK"));
    document.head.appendChild(script);
  });
}

/**
 * Some Deluxe environments/tests do **not** expose a UMD global named
 * `window.EmbeddedPayments`. This helper inspects several likely locations
 * and finally searches window values for an object with init/render/setEventHandlers.
 */
function findEmbeddedPayments(): any | null {
  const w = window as any;

  const candidates = [
    w.EmbeddedPayments,
    w.deluxe?.EmbeddedPayments,
    w.deluxe?.embeddedPayments,
    w._EmbeddedPayments,
    w._embeddedPayments,
  ].filter(Boolean);

  for (const c of candidates) {
    if (c && typeof c.init === "function" && typeof c.render === "function") {
      return c;
    }
  }

  // Last‑ditch heuristic: scan window for a likely SDK object
  try {
    for (const key of Object.keys(w)) {
      const v = (w as any)[key];
      if (
        v &&
        typeof v === "object" &&
        typeof v.init === "function" &&
        typeof v.render === "function" &&
        typeof v.setEventHandlers === "function"
      ) {
        return v;
      }
    }
  } catch {
    // ignore cross-origin or sealed props
  }

  return null;
}

/** Returns true if the second ISO date is exactly one day after the first. */
function isConsecutive(d0: string, d1: string): boolean {
  const a = new Date(`${d0}T00:00:00`);
  const b = new Date(`${d1}T00:00:00`);
  const diff = (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
  return diff === 1;
}

function sortIsoDates(dates: string[]): string[] {
  return [...dates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function inRange(iso: string, startIso: string, endIso: string) {
  const t = new Date(`${iso}T00:00:00`).getTime();
  const s = new Date(`${startIso}T00:00:00`).getTime();
  const e = new Date(`${endIso}T00:00:00`).getTime();
  return t >= s && t <= e;
}

function buildProductsForJwt(args: {
  booking: BookingLine | null;
  merchItems: MerchItem[];
}) {
  const { booking, merchItems } = args;
  const products: Array<{
    name?: string;
    skuCode?: string;
    quantity?: number;
    price?: number;
    description?: string;
    unitOfMeasure?: string;
    itemDiscountAmount?: number;
    itemDiscountRate?: number;
  }> = [];

  if (booking) {
    products.push({
      name: "Dove Hunt Package",
      skuCode: "HUNT",
      quantity: booking.numberOfHunters,
      price: 0,
      description: `${booking.dates.length} day(s) • ${booking.numberOfHunters} hunter(s)`,
      unitOfMeasure: "Each",
    });
  }

  for (const m of merchItems) {
    products.push({
      name: m.name,
      skuCode: m.skuCode,
      quantity: m.qty,
      price: m.price,
      unitOfMeasure: "Each",
    });
  }
  return products;
}

function calculateTotals(args: {
  booking: BookingLine | null;
  merchItems: MerchItem[];
  cfg: SeasonConfig | null;
}) {
  const { booking, merchItems, cfg } = args;

  const merchTotal = merchItems.reduce((sum, m) => sum + m.price * m.qty, 0);

  let bookingTotal = 0;
  if (booking && booking.dates.length > 0) {
    const all = sortIsoDates(booking.dates);

    const weekdayRate = cfg?.weekdayRate ?? 125;
    const wkRates = cfg?.weekendRates ?? {
      singleDay: 200,
      twoConsecutiveDays: 350,
      threeDayCombo: 450,
    };

    const isInSeason = (iso: string) => {
      if (!cfg) {
        const d = new Date(`${iso}T00:00:00`);
        const m = d.getMonth() + 1;
        const dd = d.getDate();
        return (m === 9 && dd >= 6) || (m === 10 && dd <= 26);
      }
      return inRange(iso, cfg.seasonStart, cfg.seasonEnd);
    };

    const isWeekend = (iso: string) => {
      const d = new Date(`${iso}T00:00:00`);
      const dow = d.getDay(); // 0 Sun..6 Sat
      return dow === 5 || dow === 6 || dow === 0; // Fri/Sat/Sun
    };

    const offSeasonDays = all.filter((d) => !isInSeason(d));
    bookingTotal +=
      offSeasonDays.length * weekdayRate * (booking.numberOfHunters || 1);

    const inSeasonDays = all.filter((d) => isInSeason(d));
    const seasonDaysSorted = sortIsoDates(inSeasonDays);
    let seasonCostPerPerson = 0;
    for (let i = 0; i < seasonDaysSorted.length; ) {
      const d0 = seasonDaysSorted[i];
      const d1 = seasonDaysSorted[i + 1];
      const d2 = seasonDaysSorted[i + 2];
      const wknd0 = d0 ? isWeekend(d0) : false;
      const wknd1 = d1 ? isWeekend(d1) : false;
      const wknd2 = d2 ? isWeekend(d2) : false;

      if (
        d0 &&
        d1 &&
        d2 &&
        wknd0 &&
        wknd1 &&
        wknd2 &&
        isConsecutive(d0, d1) &&
        isConsecutive(d1, d2)
      ) {
        seasonCostPerPerson += wkRates.threeDayCombo;
        i += 3;
        continue;
      }
      if (d0 && d1 && isConsecutive(d0, d1)) {
        seasonCostPerPerson += wkRates.twoConsecutiveDays;
        i += 2;
        continue;
      }
      if (d0) {
        seasonCostPerPerson += wkRates.singleDay;
        i += 1;
        continue;
      }
      i++;
    }
    bookingTotal += seasonCostPerPerson * (booking.numberOfHunters || 1);

    const partyDays = booking.partyDeckDates?.length || 0;
    const partyRate = cfg?.partyDeckRatePerDay ?? 500;
    bookingTotal += partyDays * partyRate;
  }

  const amount = bookingTotal + merchTotal;
  return { bookingTotal, merchTotal, amount };
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { booking, merchItems, isHydrated } = useCart();

  const [orderId] = useState(() => {
    const existing = localStorage.getItem(ORDER_ID_KEY);
    if (existing) return existing;
    const uuid =
      typeof crypto !== "undefined" && (crypto as any).randomUUID
        ? (crypto as any).randomUUID()
        : Math.random().toString(36).slice(2) +
          Math.random().toString(36).slice(2);
    localStorage.setItem(ORDER_ID_KEY, uuid);
    return uuid;
  }) as unknown as [string, any];

  const [seasonConfig, setSeasonConfig] = useState(null as SeasonConfig | null);
  const [cfgError, setCfgError] = useState("") as unknown as [string, any];
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await getSeasonConfig();
        if (mounted) setSeasonConfig(cfg);
      } catch (e: any) {
        if (mounted) setCfgError(e?.message || "Failed to load season config");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const merchArray: MerchItem[] = useMemo(() => {
    const arr: MerchItem[] = [];
    const items = merchItems as any;
    const values: any[] = items ? Object.values(items) : [];
    for (const v of values) {
      const sku = v?.product?.skuCode ?? v?.product?.id ?? "SKU";
      arr.push({
        skuCode: sku,
        name: v?.product?.name ?? "Item",
        qty: v?.quantity ?? 0,
        price: v?.product?.price ?? 0,
      });
    }
    return arr;
  }, [merchItems]);

  const [customer, setCustomer] = useState(() => {
    const displayName = user?.displayName || "";
    const parts = displayName.split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";
    const initial: CustomerInfo = {
      firstName,
      lastName,
      email: user?.email || "",
      phone: "",
      billingAddress: {},
    };
    return initial;
  }) as unknown as [CustomerInfo, any];

  const { amount } = useMemo(
    () =>
      calculateTotals({
        booking: booking
          ? {
              dates: booking.dates,
              numberOfHunters: booking.numberOfHunters,
              partyDeckDates: booking.partyDeckDates,
              seasonConfig: seasonConfig || undefined,
            }
          : null,
        merchItems: merchArray,
        cfg: seasonConfig,
      }),
    [booking, merchArray, seasonConfig]
  );

  const [sdkReady, setSdkReady] = useState(false);
  const [instanceReady, setInstanceReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("") as unknown as [string, any];
  const instanceRef = useRef(null) as unknown as { current: any };

  const ensureOrder = useCallback(async () => {
    const ref = doc(db, "orders", orderId);
    const snap = await getDoc(ref);
    let base: OrderDoc = {
      userId: user?.uid || "anon",
      status: "pending",
      total: amount,
      currency: "USD",
      createdAt: serverTimestamp(),
      booking: booking
        ? {
            userId: user?.uid || "anon",
            dates: booking.dates,
            numberOfHunters: booking.numberOfHunters,
            partyDeckDates: booking.partyDeckDates || [],
            seasonConfig: seasonConfig || undefined,
            lineItems: [
              {
                description: "Hunt package",
                quantity: booking.numberOfHunters,
                price: 0,
                skuCode: "HUNT",
              },
            ],
          }
        : null,
      merchItems: merchArray.map((m) => ({
        skuCode: m.skuCode,
        name: m.name,
        quantity: m.qty,
        price: m.price,
      })),
      customer: {
        firstName: customer.firstName || "Guest",
        lastName: customer.lastName || "Customer",
        email: customer.email || user?.email || "",
        phone: customer.phone || "",
        billingAddress: {
          line1: customer.billingAddress?.line1,
          line2: customer.billingAddress?.line2,
          city: customer.billingAddress?.city,
          state: customer.billingAddress?.state,
          postalCode: customer.billingAddress?.postalCode,
          country:
            customer.billingAddress?.country
              ?.toString()
              .trim()
              .slice(0, 2)
              .toUpperCase() || "US",
        },
      },
    };
    base = pruneUndefinedDeep(base);
    if (!snap.exists()) {
      await setDoc(ref, base, { merge: true });
    } else {
      await setDoc(
        ref,
        { ...base, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
  }, [amount, booking, customer, merchArray, orderId, seasonConfig, user]);

  const startEmbeddedPayment = useCallback(async () => {
    setErrorMsg("");

    let applePayEnabled = false;
    let googlePayEnabled = false;

    if (!customer.firstName || !customer.lastName || !customer.email) {
      setErrorMsg(
        "Please complete your customer information before starting payment."
      );
      return;
    }
    if (amount <= 0) {
      setErrorMsg("Amount must be greater than zero to initiate payment.");
      return;
    }

    setIsSubmitting(true);
    try {
      try {
        const inst = instanceRef.current;
        if (inst?.destroy) inst.destroy();
        else if (inst?.unmount) inst.unmount();
        instanceRef.current = null;
      } catch {}

      await ensureOrder();

      let paymentMethods: ("cc" | "ach")[] = ["cc"];
      try {
        const statusResp = await fetch("/api/getEmbeddedMerchantStatus");
        if (statusResp.ok) {
          const status = await statusResp.json();

          if (status?.achEnabled === true) paymentMethods = ["cc", "ach"];
          if (
            Array.isArray(status?.methods) &&
            status.methods.includes("ach")
          ) {
            if (!paymentMethods.includes("ach")) paymentMethods.push("ach");
          }

          applePayEnabled =
            !!status?.applePayEnabled ||
            (Array.isArray(status?.methods) &&
              status.methods.includes("applePay"));
          googlePayEnabled =
            !!status?.googlePayEnabled ||
            (Array.isArray(status?.methods) &&
              status.methods.includes("googlePay"));
        }
      } catch (err) {
        console.warn("Failed to fetch merchant status", err);
      }

      const jwtResp = await fetch("/api/createEmbeddedJwt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          amount,
          currency: "USD",
          customer: {
            firstName: customer.firstName || "Guest",
            lastName: customer.lastName || "Customer",
            billingAddress: {
              address: customer.billingAddress?.line1,
              city: customer.billingAddress?.city,
              state: customer.billingAddress?.state,
              zipCode: customer.billingAddress?.postalCode,
              countryCode:
                customer.billingAddress?.country
                  ?.toString()
                  .trim()
                  .slice(0, 2)
                  .toUpperCase() || "USA",
            },
          },
          products: buildProductsForJwt({
            booking: booking
              ? {
                  dates: booking.dates,
                  numberOfHunters: booking.numberOfHunters,
                  partyDeckDates: booking.partyDeckDates,
                  seasonConfig: seasonConfig || undefined,
                }
              : null,
            merchItems: merchArray,
          }),
        }),
      });
      if (!jwtResp.ok) {
        const txt = await jwtResp.text().catch(() => "");
        throw new Error(
          `JWT error ${jwtResp.status}: ${txt || jwtResp.statusText}`
        );
      }
      const { jwt, embeddedBase } = (await jwtResp.json()) as {
        jwt: string;
        embeddedBase?: string;
      };
      if (!jwt) throw new Error("JWT missing from response");

      const scriptSrc = embeddedBase
        ? `${embeddedBase}/embedded/javascripts/deluxe.js`
        : undefined;
      await loadDeluxeSdk(scriptSrc);

      // NEW: do not assume UMD global; locate SDK robustly
      const EP = findEmbeddedPayments();
      if (!EP || typeof EP.init !== "function") {
        throw new Error(
          "Deluxe SDK loaded but could not locate the EmbeddedPayments object."
        );
      }
      setSdkReady(true);

      const isSandbox = (embeddedBase || "").includes("payments2.");
      const config = {
        countryCode: "US",
        currencyCode: "USD",
        paymentMethods,
        supportedNetworks: ["visa", "masterCard", "amex", "discover"],
        googlePayEnv: isSandbox ? "TEST" : "PRODUCTION",
        merchantCapabilities: ["supports3DS"],
        allowedCardAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
        hideApplePayButton: !applePayEnabled,
        hideGooglePayButton: !googlePayEnabled,
      } as any;

      const initReturn = EP.init(jwt, config);
      const instance = await initReturn.setEventHandlers({
        onTxnSuccess: async (_gateway: any, data: any) => {
          try {
            const ref = doc(db, "orders", orderId);
            await setDoc(
              ref,
              {
                deluxe: {
                  lastEvent: data || null,
                  updatedAt: serverTimestamp(),
                },
              },
              { merge: true }
            );
          } catch (err) {
            console.warn("Failed to record Deluxe lastEvent", err);
          }
          navigate(`/dashboard?status=paid&orderId=${orderId}`);
        },
        onTxnFailed: (_gateway: any, data: any) => {
          console.warn("[Deluxe] Failed:", data);
          setErrorMsg(
            "Payment failed. Please try again or use the hosted checkout."
          );
        },
        onTxnCancelled: (_gateway: any, data: any) => {
          console.log("[Deluxe] Cancelled:", data);
          setErrorMsg("Payment cancelled.");
        },
        onValidationError: (_gateway: any, data: any) => {
          console.warn("[Deluxe] Validation error:", data);
          setErrorMsg("Validation error — please check your info.");
        },
        onTokenSuccess: (_gateway: any, data: any) => {
          console.log("[Deluxe] Token success", data);
        },
        onTokenFailed: (_gateway: any, data: any) => {
          console.warn("[Deluxe] Token failed", data);
        },
      });
      instanceRef.current = instance;

      if (!document.getElementById(EMBEDDED_CONTAINER_ID)) {
        throw new Error(`Missing container #${EMBEDDED_CONTAINER_ID}`);
      }

      EP.render({
        containerId: EMBEDDED_CONTAINER_ID,
        paymentpanelstyle: "light",
        walletsbgcolor: "#000",
        walletsborderadius: "10px",
        walletspadding: "10px",
        walletsgap: "10px",
      });
      setInstanceReady(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Unable to start embedded payment.");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    amount,
    booking,
    customer,
    ensureOrder,
    merchArray,
    navigate,
    orderId,
    seasonConfig,
  ]);

  const fallbackHostedCheckout = useCallback(async () => {
    try {
      await ensureOrder();
      const origin = window.location.origin;
      const resp = await fetch("/api/createDeluxePayment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          successUrl: `${origin}/dashboard?status=paid&orderId=${orderId}`,
          cancelUrl: `${origin}/dashboard?status=cancelled&orderId=${orderId}`,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Hosted checkout failed");
      const url = data?.paymentUrl;
      if (!url) throw new Error("Missing paymentUrl");
      window.location.href = url;
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Hosted checkout failed");
    }
  }, [ensureOrder, orderId]);

  useEffect(() => {
    return () => {
      try {
        const inst = instanceRef.current;
        if (inst?.destroy) inst.destroy();
        else if (inst?.unmount) inst.unmount();
        else if (window.EmbeddedPayments?.destroy) {
          window.EmbeddedPayments.destroy();
        }
      } catch {}
    };
  }, []);

  const canStart = useMemo(() => amount > 0 && !!orderId, [amount, orderId]);

  if (!isHydrated) {
    return <div className="text-center text-white py-20">Loading cart…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Checkout</h1>
        <p className="text-sm opacity-70">
          Order ID: <span className="font-mono">{orderId}</span>
        </p>
      </div>

      {(errorMsg || cfgError) && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 p-3">
          {errorMsg || cfgError}
        </div>
      )}

      <section className="mb-8 p-4 rounded-xl border border-white/10 bg-white">
        <h2 className="text-xl mb-4 font-acumin">Customer Info</h2>
        <CustomerInfoForm value={customer} onChange={setCustomer} />
        <div className="mt-10 p-4">
          <h2 className="text-xl mb-3  font-acumin">Order Summary</h2>
          <div className="flex items-center gap-2 max-w-[200px]">
            <div className="text-lg font-acumin">Total</div>
            <div className="text-2xl font-bold">${amount.toFixed(2)}</div>
          </div>
        </div>
      </section>

      <section className="mb-6 p-4 rounded-xl border border-white/10 bg-neutral-100">
        <h2 className="text-xl mb-3 font-acumin">Pay Securely (Embedded)</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            disabled={!canStart || isSubmitting}
            onClick={startEmbeddedPayment}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent-sage)] text-white disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "Starting…" : "Start secure payment"}
          </button>
          <button
            onClick={fallbackHostedCheckout}
            className="hidden px-4 py-2 rounded-lg bg-[var(--color-card-hover,#172034)] border border-white/10 hover:bg-white/10 transition-colors"
          >
            Use hosted checkout (fallback)
          </button>
        </div>

        <div
          id={EMBEDDED_CONTAINER_ID}
          className={[
            "min-h-[240px] rounded-xl border border-white/10",
            sdkReady ? "opacity-100" : "opacity-60",
            "transition-opacity",
          ].join(" ")}
        />

        {!sdkReady && (
          <p className="mt-2 text-sm opacity-70">
            The payment panel will appear here after you click “Start secure
            payment.”
          </p>
        )}
        {sdkReady && !instanceReady && (
          <p className="mt-2 text-sm opacity-70">Loading payment panel…</p>
        )}
      </section>

      <p className="text-xs opacity-60">
        By paying, you agree to the ranch’s property rules and cancellation
        policy.
      </p>
    </div>
  );
}
