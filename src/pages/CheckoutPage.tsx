import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import CustomerInfoForm from "../components/CustomerInfoForm";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import toIsoAlpha3 from "../utils/toIsoAlpha3";
import { formatLongDate } from "../utils/formatDate";
import { groupIsoDatesIntoRanges } from "../utils/dateUtils";

/**
 * Deluxe Embedded Payments SDK (runtime global).  We support multiple attachment
 * points because the SDK sometimes exposes the object at different paths.
 */
type EPApi = {
  init: (jwt: string, config: Record<string, any>) => any;
  setEventHandlers?: (map: Record<string, (gw: any, data: any) => void>) => any;
  render: (opts: { containerId: string } & Record<string, any>) => void;
  pay?: (jwt: string) => void;
  destroy?: () => void;
};
declare global {
  interface Window {
    EmbeddedPayments?: EPApi;
    Deluxe?: { EmbeddedPayments?: EPApi };
    deluxe?: { EmbeddedPayments?: EPApi };
  }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const EmbeddedPayments: EPApi | undefined;

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
type BookingLine = {
  dates: string[];
  numberOfHunters: number;
  partyDeckDates?: string[];
  seasonConfig?: SeasonConfig;
  bookingTotal?: number; // computed at runtime (used to derive per-hunter price for JWT products)
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

/** Recursively drop undefined so Firestore merges cleanly. */
function pruneUndefinedDeep<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map((v) => pruneUndefinedDeep(v)) as any;
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
    return out as any;
  }
  return obj;
}

/** Inject (or update) a style tag specifically for the embedded panel */
function ensureEmbeddedStyles() {
  const id = "rdpb-embedded-styles";
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.head.appendChild(style);
  }
  style.textContent = `
    /* Make the panel responsive */
    #${EMBEDDED_CONTAINER_ID} { width: 100%; }
    #${EMBEDDED_CONTAINER_ID} .purchase-summary { font-family: inherit; }
    /* Hide the blank image thumbnail and tighten layout */
    #${EMBEDDED_CONTAINER_ID} .product-thumbnail { display: none !important; }
    #${EMBEDDED_CONTAINER_ID} .product-info { padding-left: 0 !important; }
    /* Sane mobile font sizes */
    @media (max-width: 480px) {
      #${EMBEDDED_CONTAINER_ID} .summary-title { font-size: 1rem !important; }
      #${EMBEDDED_CONTAINER_ID} .summary-attribute { font-size: 0.875rem !important; }
    }
  `;
}

/** Load the Deluxe SDK (sandbox by default unless server tells us base). */
function loadDeluxeSdk(src?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url =
      src || "https://payments2.deluxe.com/embedded/javascripts/deluxe.js";

    // Clean mismatched copies (switching envs)
    try {
      document
        .querySelectorAll(
          'script[src*="deluxe.com/embedded/javascripts/deluxe.js"]'
        )
        .forEach((el) => {
          if ((el as HTMLScriptElement).src !== url)
            el.parentElement?.removeChild(el);
        });
    } catch {}

    const existing = document.querySelector(
      `script[src="${url}"]`
    ) as HTMLScriptElement | null;
    const finish = () => {
      const t0 = Date.now();
      const poll = () => {
        const w = window as any;
        const EP =
          w.EmbeddedPayments ||
          w?.Deluxe?.EmbeddedPayments ||
          w?.deluxe?.EmbeddedPayments;
        if (EP) return resolve();
        if (Date.now() - t0 > 10000)
          return reject(new Error("Deluxe SDK loaded but object not found"));
        setTimeout(poll, 50);
      };
      poll();
    };
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
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
    script.onload = finish;
    script.onerror = () => reject(new Error("Failed to load Deluxe SDK"));
    document.head.appendChild(script);
  });
}

/** Helpers for pricing logic **/
function isConsecutive(d0: string, d1: string): boolean {
  const a = new Date(`${d0}T00:00:00`);
  const b = new Date(`${d1}T00:00:00`);
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24) === 1;
}
function sortIsoDates(dates: string[]) {
  return [...dates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
function inRange(iso: string, startIso: string, endIso: string) {
  const t = new Date(`${iso}T00:00:00`).getTime();
  const s = new Date(`${startIso}T00:00:00`).getTime();
  const e = new Date(`${endIso}T00:00:00`).getTime();
  return t >= s && t <= e;
}

/** Build products for the Embedded JWT (unit pricing is critical to avoid $NaN). */
function buildProductsForJwt(args: {
  booking: BookingLine | null;
  merchItems: MerchItem[];
}) {
  const { booking, merchItems } = args;
  const products: Array<{
    name?: string;
    skuCode?: string;
    quantity?: number;
    price?: number; // unit price in whole currency units
    description?: string;
    unitOfMeasure?: string;
  }> = [];

  if (booking) {
    const hunters = Math.max(1, Number(booking.numberOfHunters || 1));
    const partyDays = booking.partyDeckDates?.length || 0;
    const partyRate = booking.seasonConfig?.partyDeckRatePerDay ?? 500; // default
    const partySubtotal = partyDays * partyRate;
    const bookingSubtotal = Number(booking.bookingTotal || 0);
    const perHunterUnit = Math.max(
      0,
      Math.round((bookingSubtotal - partySubtotal) / hunters)
    );

    products.push({
      name: "Dove Hunt Package",
      skuCode: "HUNT",
      quantity: hunters,
      price: perHunterUnit, // ✅ fixes NaN in product-cost
      description: `${booking.dates.length} day(s) • ${hunters} hunter(s)`,
      unitOfMeasure: "Each",
    });
    if (partyDays > 0) {
      products.push({
        name: "Party Deck",
        skuCode: "PARTY",
        quantity: partyDays,
        price: partyRate,
        unitOfMeasure: "Day",
      });
    }
  }
  for (const m of merchItems) {
    products.push({
      name: m.name,
      skuCode: m.skuCode,
      quantity: m.qty,
      price: m.price, // unit price
      unitOfMeasure: "Each",
    });
  }
  return products;
}

/** Calculate booking + merch totals. All values are whole currency units (no cents). */
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
      const d = new Date(`${iso}T00:00:00`);
      const dow = d.getDay();
      return dow === 5 || dow === 6 || dow === 0;
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

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { booking, merchItems, isHydrated } = useCart();

  /** STEP STATE — 1: Customer, 2: Review, 3: Pay */
  const [step, setStep] = useState<1 | 2 | 3>(1);

  /** Persist/derive orderId */
  const [orderId] = useState(() => {
    const existing = localStorage.getItem(ORDER_ID_KEY);
    if (existing) return existing;
    const uuid = (crypto as any)?.randomUUID
      ? (crypto as any).randomUUID()
      : Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2);
    localStorage.setItem(ORDER_ID_KEY, uuid);
    return uuid;
  }) as unknown as [string, any];

  /** Season config */
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

  /** Merch array from cart */
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

  /** Customer state */
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

  /** Totals (and stash bookingTotal so products[] can get unit prices) */
  const totals = useMemo(
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
  const amount = totals.amount;

  /** Step 3: formatted date range chips using your utils */
  const dateRangeLabels = useMemo(() => {
    if (!booking?.dates?.length) return [];
    return groupIsoDatesIntoRanges(booking.dates).map(({ start, end }) =>
      start === end
        ? formatLongDate(start, { weekday: true })
        : `${formatLongDate(start, { weekday: true })} – ${formatLongDate(end, {
            weekday: true,
          })}`
    );
  }, [booking?.dates]);

  const partyDeckRangeLabels = useMemo(() => {
    if (!booking?.partyDeckDates?.length) return [];
    return groupIsoDatesIntoRanges(booking.partyDeckDates).map(
      ({ start, end }) =>
        start === end
          ? formatLongDate(start, { weekday: true })
          : `${formatLongDate(start, { weekday: true })} – ${formatLongDate(
              end,
              { weekday: true }
            )}`
    );
  }, [booking?.partyDeckDates]);

  /** Embedded lifecycle */
  const [sdkReady, setSdkReady] = useState(false);
  const [instanceReady, setInstanceReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("") as unknown as [string, any];
  const instanceRef = useRef(null) as unknown as { current: any };

  /** Firestore ensure order */
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
    if (!snap.exists()) await setDoc(ref, base, { merge: true });
    else
      await setDoc(
        ref,
        { ...base, updatedAt: serverTimestamp() },
        { merge: true }
      );
  }, [amount, booking, customer, merchArray, orderId, seasonConfig, user]);

  /** Start Embedded flow */
  const startEmbeddedPayment = useCallback(async () => {
    setErrorMsg("");

    // Basic validation
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
      // Place the container in the DOM (step 3) and give the browser a tick
      setStep(3);
      await new Promise((r) => setTimeout(r));

      // Destroy any prior instance
      try {
        const inst = instanceRef.current;
        if (inst?.destroy) inst.destroy();
        else if (inst?.unmount) inst.unmount();
        instanceRef.current = null;
      } catch {}

      // Ensure order
      await ensureOrder();

      // Discover methods/wallets
      let paymentMethods: ("cc" | "ach")[] = ["cc"];
      let applePayEnabled = false;
      let googlePayEnabled = false;
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
      } catch {}

      // Server-minted JWT
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
                  bookingTotal: totals.bookingTotal, // provide to compute unit prices
                }
              : null,
            merchItems: merchArray,
          }),
          summary: { hide: false, hideTotals: false },
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

      // Load correct SDK base (sandbox vs prod)
      const scriptSrc = embeddedBase
        ? `${embeddedBase}/embedded/javascripts/deluxe.js`
        : undefined;
      await loadDeluxeSdk(scriptSrc);

      const w = window as any;
      const EP: EPApi | undefined =
        w.EmbeddedPayments ||
        w?.Deluxe?.EmbeddedPayments ||
        w?.deluxe?.EmbeddedPayments;
      if (!EP || typeof EP.init !== "function")
        throw new Error("Deluxe SDK not initialized");

      setSdkReady(true);
      ensureEmbeddedStyles();

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

      const initResult: any = EP.init(jwt, config);
      const handlerHost: any =
        (initResult &&
          typeof initResult.setEventHandlers === "function" &&
          initResult) ||
        (typeof (EP as any).setEventHandlers === "function" && EP) ||
        null;

      if (handlerHost) {
        await Promise.resolve(
          handlerHost.setEventHandlers({
            onTxnSuccess: async (_gw: any, data: any) => {
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
                // Best-effort capacity increment (webhook remains source of truth)
                try {
                  await fetch("/api/incrementAvailability", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ orderId }),
                  });
                } catch {}
              } catch (err) {
                console.warn("Failed to record Deluxe lastEvent", err);
              }
              navigate(`/dashboard?status=paid&orderId=${orderId}`);
            },
            onTxnFailed: (_gw: any, data: any) => {
              console.warn("[Deluxe] Failed:", data);
              setErrorMsg("Payment failed. Please try again.");
              setStep(2);
            },
            onTxnCancelled: (_gw: any, data: any) => {
              console.log("[Deluxe] Cancelled:", data);
              setErrorMsg("Payment cancelled.");
              setStep(2);
            },
            onValidationError: (_gw: any, data: any) => {
              console.warn("[Deluxe] Validation error:", data);
              setErrorMsg("Validation error — please check your info.");
            },
            onTokenSuccess: (_gw: any, data: any) => {
              console.log("[Deluxe] Token success", data);
            },
            onTokenFailed: (_gw: any, data: any) => {
              console.warn("[Deluxe] Token failed", data);
            },
          })
        );
      } else {
        console.warn("Deluxe: setEventHandlers() unavailable; continuing.");
      }

      instanceRef.current = handlerHost || EP;

      // Ensure container exists before render
      if (!document.getElementById(EMBEDDED_CONTAINER_ID)) {
        throw new Error(`Missing container #${EMBEDDED_CONTAINER_ID}`);
      }

      const renderHost: any =
        handlerHost && handlerHost.render ? handlerHost : EP;
      renderHost.render({
        containerId: EMBEDDED_CONTAINER_ID,
        paymentpanelstyle: "light",
        productsbgcolor: "#f8f8f8",
        productsfontcolor: "#333333",
        productsfontsize: "15px",
        paybuttoncolor: "#0F13E2",
        cancelbuttoncolor: "#69D717",
        walletsbgcolor: "#000",
        walletsborderadius: "10px",
        walletspadding: "10px",
        walletsgap: "10px",
        walletswidth: "100%",
      });
      setInstanceReady(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Unable to start embedded payment.");
      setStep(2); // go back to review
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
    totals.bookingTotal,
  ]);

  /** Cleanup SDK instance */
  useEffect(() => {
    return () => {
      try {
        const inst = instanceRef.current;
        if (inst?.destroy) inst.destroy();
        else if (inst?.unmount) inst.unmount();
        const w = window as any;
        const EP =
          w.EmbeddedPayments ||
          w?.Deluxe?.EmbeddedPayments ||
          w?.deluxe?.EmbeddedPayments;
        if (EP?.destroy) EP.destroy();
      } catch {}
    };
  }, []);

  /** Derived flags */
  const canStart = useMemo(() => amount > 0 && !!orderId, [amount, orderId]);
  const canNextFromStep1 = !!(
    customer.firstName &&
    customer.lastName &&
    customer.email
  );

  if (!isHydrated)
    return <div className="text-center py-20">Loading cart…</div>;

  /** Small stepper header */
  const Stepper = () => (
    <div className="flex items-center gap-3 mb-6 text-sm select-none mt-20">
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div
            className={`rounded-full flex items-center justify-center font-semibold transition-transform duration-300 ease-in-out ${
              step === n
                ? "bg-[var(--color-accent-gold)] text-white h-10 w-10 animate-pulse"
                : "bg-[var(--color-accent-sage)] text-black h-8 w-8"
            }`}
          >
            {n}
          </div>
          <span className="mr-2">
            {n === 1 ? "Customer" : n === 2 ? "Review" : "Pay"}
          </span>
          {n < 3 && <div className="w-8 h-px bg-neutral-300" />}
        </div>
      ))}
    </div>
  );

  /** Order line-item renderer for Step 2 */
  const OrderLines = () => {
    const lines: Array<{
      label: string;
      qty?: number;
      price?: number;
      note?: string;
    }> = [];
    if (booking) {
      const hunters = booking.numberOfHunters || 1;
      const days = booking.dates.length;
      lines.push({
        label: "Dove Hunt Package",
        qty: hunters,
        price: Math.max(
          0,
          Math.round(
            (totals.bookingTotal -
              (booking.partyDeckDates?.length || 0) *
                (seasonConfig?.partyDeckRatePerDay ?? 500)) /
              Math.max(1, hunters)
          )
        ),
        note: `${days} day(s)`,
      });
      const partyDays = booking.partyDeckDates?.length || 0;
      if (partyDays > 0)
        lines.push({
          label: "Party Deck",
          qty: partyDays,
          price: seasonConfig?.partyDeckRatePerDay ?? 500,
        });
    }
    for (const m of merchArray)
      lines.push({ label: m.name, qty: m.qty, price: m.price });
    return (
      <div className="divide-y">
        {lines.map((l, idx) => (
          <div key={idx} className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">{l.label}</div>
              {l.note && <div className="text-xs opacity-70">{l.note}</div>}
            </div>
            <div className="text-right">
              <div className="text-sm">x{l.qty ?? 1}</div>
              <div className="font-semibold">${(l.price ?? 0).toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-3">
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

      <Stepper />

      {/* STEP 1 — CUSTOMER */}
      {step === 1 && (
        <section className="mb-8 p-4 rounded-xl border bg-white">
          <h2 className="text-xl mb-4 font-acumin">Customer Info</h2>
          <CustomerInfoForm value={customer} onChange={setCustomer} />
          <div className="mt-6 flex justify-between">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-lg border"
            >
              Back
            </button>
            <button
              onClick={() => setStep(2)}
              disabled={!canNextFromStep1}
              className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
            >
              Next: Review Order
            </button>
          </div>
        </section>
      )}

      {/* STEP 2 — REVIEW */}
      {step === 2 && (
        <section className="mb-8 px-4 py-10 rounded-xl border bg-white">
          <h2 className="text-2xl mb-4 font-acumin">Order Summary</h2>
          <OrderLines />
          <div className="mt-4 flex items-center justify-between">
            <div className="text-lg">Total</div>
            <div className="text-2xl font-bold">${amount.toFixed(2)}</div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded-lg border"
            >
              Back
            </button>
            <div className="flex gap-3">
              <button
                disabled={!canStart || isSubmitting}
                onClick={startEmbeddedPayment}
                className="px-4 py-2 rounded-lg bg-[var(--color-background)] text-white font-bold disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Starting…" : "Start secure payment"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* STEP 3 — PAY */}
      {step === 3 && (
        <section className="mb-6 p-4 rounded-xl border bg-neutral-100">
          <h2 className="text-xl mb-3">Pay Securely</h2>
          <div className="mb-3 text-sm opacity-70">
            Total: ${amount.toFixed(2)}
          </div>

          {/* Order quick summary (dates via your utils) */}
          {booking && (
            <div className="mb-4 p-3 rounded-lg border bg-white/70">
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide opacity-60">
                    Hunters
                  </div>
                  <div className="font-semibold">{booking.numberOfHunters}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide opacity-60">
                    Days
                  </div>
                  <div className="font-semibold">{booking.dates.length}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide opacity-60">
                    Dates
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {dateRangeLabels.map((label, i) => (
                      <span
                        key={i}
                        className="inline-block px-2 py-1 rounded-full bg-neutral-100 border text-xs"
                      >
                        {label}
                      </span>
                    ))}
                    {dateRangeLabels.length === 0 && (
                      <span className="text-xs opacity-70">—</span>
                    )}
                  </div>
                </div>
              </div>
              {booking.partyDeckDates?.length ? (
                <div className="mt-3 text-xs">
                  <span className="opacity-60 mr-1">Party Deck:</span>
                  <span className="font-medium">
                    {partyDeckRangeLabels.join(", ")}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          <div
            id={EMBEDDED_CONTAINER_ID}
            className={[
              "min-h-[260px] rounded-xl border",
              sdkReady ? "opacity-100" : "opacity-60",
              "transition-opacity bg-white",
            ].join(" ")}
          />
          {!sdkReady && (
            <p className="mt-2 text-sm opacity-70">Loading payment panel…</p>
          )}
          {sdkReady && !instanceReady && (
            <p className="mt-2 text-sm opacity-70">
              Initializing payment panel…
            </p>
          )}
          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 rounded-lg border"
            >
              Back to Review
            </button>
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded-lg border"
            >
              Edit Customer Info
            </button>
          </div>
        </section>
      )}

      <p className="text-xs opacity-60">
        By paying, you agree to the ranch’s property rules and cancellation
        policy.
      </p>
    </div>
  );
}
