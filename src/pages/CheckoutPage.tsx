import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import CustomerInfoForm from "../components/CustomerInfoForm";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import toIsoAlpha3 from "../utils/toIsoAlpha3";

/**
 * CheckoutPage (patched)
 * - Loader now resolves when ANY Deluxe global is present (EmbeddedPayments, DigitalWalletsPay, etc.)
 * - Proper instance usage: const instance = await EP.init(jwt, config); await instance.render(...)
 * - ISO-2 countryCode sent in config (US), while JWT payload still uses whatever backend expects
 */

declare global {
  interface Window {
    EmbeddedPayments?: any;
    DigitalWalletsPay?: any;
    DigitalWallets?: any;
    DeluxeEmbedded?: any;
    define?: any;
    module?: any;
    global?: any;
    process?: any;
  }
}

type SeasonConfig = {
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

type MerchItem = { skuCode: string; name: string; qty: number; price: number };

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

/* ------------------------------------------------------------------------- */
/* Utility helpers                                                           */
/* ------------------------------------------------------------------------- */

function pruneUndefinedDeep<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(pruneUndefinedDeep) as unknown as T;
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

function sortIsoDates(dates: string[]) {
  return [...dates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
function isConsecutive(d0: string, d1: string): boolean {
  const a = new Date(`${d0}T00:00:00`).getTime();
  const b = new Date(`${d1}T00:00:00`).getTime();
  return (b - a) / (1000 * 60 * 60 * 24) === 1;
}
function inRange(iso: string, startIso: string, endIso: string) {
  const t = new Date(`${iso}T00:00:00`).getTime();
  const s = new Date(`${startIso}T00:00:00`).getTime();
  const e = new Date(`${endIso}T00:00:00`).getTime();
  return t >= s && t <= e;
}

function calculateTotals(args: {
  booking: {
    dates: string[];
    numberOfHunters: number;
    partyDeckDates?: string[];
    seasonConfig?: SeasonConfig;
  } | null;
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

    const isInSeason = (iso: string) =>
      cfg
        ? inRange(iso, cfg.seasonStart, cfg.seasonEnd)
        : (() => {
            const d = new Date(`${iso}T00:00:00`);
            const m = d.getMonth() + 1;
            const dd = d.getDate();
            return (m === 9 && dd >= 6) || (m === 10 && dd <= 26);
          })();

    const isWeekend = (iso: string) => {
      const d = new Date(`${iso}T00:00:00`).getDay();
      return d === 5 || d === 6 || d === 0;
    };

    const offSeasonDays = all.filter((d) => !isInSeason(d));
    bookingTotal +=
      offSeasonDays.length * weekdayRate * (booking.numberOfHunters || 1);

    const inSeasonDays = all.filter((d) => isInSeason(d));
    const seasonDaysSorted = sortIsoDates(inSeasonDays);
    let seasonCostPerPerson = 0;

    for (let i = 0; i < seasonDaysSorted.length; ) {
      const d0 = seasonDaysSorted[i],
        d1 = seasonDaysSorted[i + 1],
        d2 = seasonDaysSorted[i + 2];
      const wk0 = d0 ? isWeekend(d0) : false,
        wk1 = d1 ? isWeekend(d1) : false,
        wk2 = d2 ? isWeekend(d2) : false;

      if (
        d0 &&
        d1 &&
        d2 &&
        wk0 &&
        wk1 &&
        wk2 &&
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

function buildProductsForJwt(args: {
  booking: {
    dates: string[];
    numberOfHunters: number;
    partyDeckDates?: string[];
    seasonConfig?: SeasonConfig;
  } | null;
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

/* ------------------------------------------------------------------------- */
/* Deluxe loader (multi-global, AMD/CJS safe)                                 */
/* ------------------------------------------------------------------------- */

function getDeluxeGlobal(): any {
  const w = window as any;
  return (
    w.EmbeddedPayments ||
    w.DigitalWalletsPay ||
    w.DigitalWallets ||
    w.DeluxeEmbedded ||
    undefined
  );
}

async function loadDeluxeSdk(src?: string): Promise<void> {
  if (getDeluxeGlobal()) return;
  const url =
    src || "https://payments2.deluxe.com/embedded/javascripts/deluxe.js";

  // Remove old tags to force re-execution
  document
    .querySelectorAll('script[src*="/embedded/javascripts/deluxe.js"]')
    .forEach((s) => s.remove());

  // Provide minimal globals some UMDs expect
  (window as any).global = (window as any).global || window;
  (window as any).process = (window as any).process || { env: {} };

  // Temporarily hide AMD/CJS shims so SDK attaches to window
  const savedDefine = (window as any).define;
  const savedModule = (window as any).module;
  try {
    delete (window as any).define;
  } catch {}
  try {
    delete (window as any).module;
  } catch {}
  const cleanup = () => {
    if (savedDefine !== undefined) (window as any).define = savedDefine;
    if (savedModule !== undefined) (window as any).module = savedModule;
  };

  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.defer = true;
    s.type = "text/javascript";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Deluxe SDK"));
    document.head.appendChild(s);
  });

  const start = Date.now();
  while (!getDeluxeGlobal()) {
    if (Date.now() - start > 15000) {
      cleanup();
      throw new Error("Deluxe SDK loaded but global missing");
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  cleanup();
}

/* ------------------------------------------------------------------------- */
/* Page component                                                             */
/* ------------------------------------------------------------------------- */

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { booking, merchItems, isHydrated } = useCart();

  const [orderId] = useState<string>(() => {
    const existing = localStorage.getItem(ORDER_ID_KEY);
    if (existing) return existing;
    const uuid =
      (crypto as any)?.randomUUID?.() ??
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    localStorage.setItem(ORDER_ID_KEY, uuid);
    return uuid;
  });

  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);
  const [cfgError, setCfgError] = useState<string>("");

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
    return {
      firstName,
      lastName,
      email: user?.email || "",
      phone: "",
      billingAddress: {} as any,
    };
  });

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
  const [errorMsg, setErrorMsg] = useState("");
  const instanceRef = useRef<any>(null);

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
          country: (customer?.billingAddress?.country || "US")
            .slice(0, 2)
            .toUpperCase(),
        },
      },
    };

    base = pruneUndefinedDeep(base);
    if (!snap.exists()) await setDoc(ref, base, { merge: true });
    else
      await setDoc(
        ref,
        { ...base, updatedAt: serverTimestamp() },
        { merge: true }
      );
  }, [amount, booking, customer, merchArray, orderId, seasonConfig, user]);

  const startEmbeddedPayment = useCallback(async () => {
    setErrorMsg("");

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
      // Cleanup any prior instance
      try {
        const inst = instanceRef.current;
        if (inst?.destroy) inst.destroy();
        else if (inst?.unmount) inst.unmount();
        instanceRef.current = null;
      } catch {}

      await ensureOrder();

      // Determine allowed payment methods (cc/ach)
      let paymentMethods: ("cc" | "ach")[] = ["cc"];
      try {
        const statusResp = await fetch("/api/getEmbeddedMerchantStatus");
        if (statusResp.ok) {
          const status = await statusResp.json();
          if (status?.achEnabled === true) paymentMethods = ["cc", "ach"];
        }
      } catch {}

      // Get JWT & base from backend
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
              countryCode: toIsoAlpha3(customer.billingAddress?.country),
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

      // Load SDK from backend's base (payments2 for sandbox)
      const scriptSrc = embeddedBase
        ? `${embeddedBase}/embedded/javascripts/deluxe.js`
        : undefined;
      await loadDeluxeSdk(scriptSrc);

      // Get whichever global the SDK exported
      const EP: any = getDeluxeGlobal();
      if (!EP || typeof EP.init !== "function")
        throw new Error("Deluxe SDK not initialized (global missing)");

      const isSandbox = (embeddedBase || "").includes("payments2.");
      const config = {
        countryCode: "US", // ISO-2 for config
        currencyCode: "USD",
        paymentMethods,
        supportedNetworks: ["visa", "mastercard", "amex", "discover"],
        googlePayEnv: isSandbox ? "TEST" : "PRODUCTION",
        merchantCapabilities: ["supports3DS"],
        allowedCardAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
      } as const;

      // init → handlers → render
      const instance = await EP.init(jwt, config);
      instanceRef.current = instance;

      instance.setEventHandlers({
        onTxnSuccess: async (_g: any, data: any) => {
          try {
            const ref = doc(db, "orders", orderId);
            const paymentId =
              data?.paymentId ||
              data?.PaymentId ||
              data?.transactionId ||
              data?.id ||
              null;
            await setDoc(
              ref,
              {
                status: "paid",
                deluxe: {
                  lastEvent: data || null,
                  updatedAt: serverTimestamp(),
                  paymentId,
                },
              },
              { merge: true }
            );
          } catch (err) {
            console.warn("Failed to record Deluxe lastEvent", err);
          }
          navigate(`/dashboard?status=paid&orderId=${orderId}`);
        },
        onTxnFailed: (_g: any, data: any) => {
          console.warn("[Deluxe] Failed:", data);
          setErrorMsg("Payment failed. Please try again.");
        },
        onTxnCancelled: () => {
          setErrorMsg("Payment cancelled.");
        },
        onValidationError: (_g: any, data: any) => {
          console.warn("[Deluxe] Validation:", data);
          setErrorMsg("Validation error — please check your info.");
        },
        onTokenSuccess: (_g: any, data: any) => {
          console.log("[Deluxe] Token success", data);
        },
        onTokenFailed: (_g: any, data: any) => {
          console.warn("[Deluxe] Token failed", data);
        },
      });

      await instance.render({
        containerId: EMBEDDED_CONTAINER_ID,
        paymentPanelStyle: "light",
      });

      setSdkReady(true);
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

  useEffect(() => {
    return () => {
      try {
        const inst = instanceRef.current;
        if (inst?.destroy) inst.destroy();
        else if (inst?.unmount) inst.unmount();
        else if ((window as any).EmbeddedPayments?.destroy)
          (window as any).EmbeddedPayments.destroy();
      } catch {}
    };
  }, []);

  const canStart = useMemo(() => amount > 0 && !!orderId, [amount, orderId]);

  if (!isHydrated)
    return <div className="text-center py-20">Loading cart…</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Checkout</h1>
        <p className="text-sm opacity-70">
          Order ID: <span className="font-mono">{orderId}</span>
        </p>
      </div>

      {(errorMsg || cfgError) && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 p-3">
          {errorMsg || cfgError}
        </div>
      )}

      <section className="mb-8 p-4 rounded-xl border bg-white">
        <h2 className="text-xl mb-4">Customer Info</h2>
        <CustomerInfoForm
          value={customer as any}
          onChange={setCustomer as any}
        />
        <div className="mt-10 p-4">
          <h2 className="text-xl mb-3">Order Summary</h2>
          <div className="flex items-center gap-2 max-w-[200px]">
            <div className="text-lg">Total</div>
            <div className="text-2xl font-bold">${amount.toFixed(2)}</div>
          </div>
        </div>
      </section>

      <section className="mb-6 p-4 rounded-xl border bg-neutral-100">
        <h2 className="text-xl mb-3">Pay Securely (Embedded)</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            disabled={!canStart || isSubmitting}
            onClick={startEmbeddedPayment}
            className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "Starting…" : "Start secure payment"}
          </button>
        </div>

        <div
          id={EMBEDDED_CONTAINER_ID}
          className={[
            "min-h-[240px] rounded-xl border",
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
