import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
  increment,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import CustomerInfoForm from "../components/CustomerInfoForm";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import toIsoAlpha3 from "../utils/toIsoAlpha3";
import { formatLongDate } from "../utils/formatDate";

type EPApi = {
  init: (jwt: string, config: Record<string, any>) => any;
  setEventHandlers?: (map: Record<string, (gw: any, data: any) => void>) => any;
  render: (opts: { containerId: string } & Record<string, any>) => void;
  destroy?: () => void;
};

declare global {
  interface Window {
    EmbeddedPayments?: EPApi;
    Deluxe?: { EmbeddedPayments?: EPApi };
    deluxe?: { EmbeddedPayments?: EPApi };
  }
}
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
  /** Subtotal for this booking used to compute per‑hunter unit for EP products. */
  bookingTotal?: number;
};

/** New merch line; tolerant to different cart shapes */
type MerchItem = {
  skuCode: string; // doc id of variant in /products (e.g., TEE-PALOMA-XL)
  name: string; // display name
  qty: number; // quantity
  price: number; // unit price in whole currency units
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

/** Recursively remove any fields with value `undefined`. */
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

/** Load the Deluxe SDK script (sandbox by default). */
function loadDeluxeSdk(src?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url =
      src || "https://payments2.deluxe.com/embedded/javascripts/deluxe.js";
    // Remove any mismatched copies (switching envs)
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

/** Find the EP object (from window or global lexical) */
function resolveEP(): EPApi | undefined {
  const w = window as any;
  if (w.EmbeddedPayments) return w.EmbeddedPayments;
  if (w.Deluxe?.EmbeddedPayments) return w.Deluxe.EmbeddedPayments;
  if (w.deluxe?.EmbeddedPayments) return w.deluxe.EmbeddedPayments;
  try {
    // eslint-disable-next-line no-eval
    const EP = (0, eval)(
      "typeof EmbeddedPayments !== 'undefined' ? EmbeddedPayments : undefined"
    ) as EPApi | undefined;
    if (EP) return EP;
  } catch {}
  return undefined;
}

async function waitForEmbeddedPayments(timeoutMs = 8000): Promise<EPApi> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const EP = resolveEP();
    if (EP && typeof EP.init === "function" && typeof EP.render === "function")
      return EP;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    "Deluxe SDK loaded but could not locate the EmbeddedPayments object."
  );
}

function isConsecutive(d0: string, d1: string): boolean {
  const a = new Date(`${d0}T00:00:00`);
  const b = new Date(`${d1}T00:00:00`);
  return (b.getTime() - a.getTime()) / 86400000 === 1;
}
function sortIsoDates(dates: string[]) {
  return [...dates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function ensureEmbeddedStyles() {
  const styleId = "rdpb-embedded-styles";
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    #${EMBEDDED_CONTAINER_ID} .embedded-form-container { max-width: 720px; margin: 0 auto; }
    #${EMBEDDED_CONTAINER_ID} .product-thumbnail { display: none !important; }
    #${EMBEDDED_CONTAINER_ID} .product-info { margin-left: 0 !important; padding-left: 0 !important; }
    #${EMBEDDED_CONTAINER_ID} .summary-title { font-family: var(--font-acumin, sans-serif) !important; }
    @media (max-width: 480px) {
      #${EMBEDDED_CONTAINER_ID} .summary-title { font-size: 1rem !important; }
      #${EMBEDDED_CONTAINER_ID} .summary-attribute { font-size: 0.875rem !important; }
    }
  `;
}
function inRange(iso: string, startIso: string, endIso: string) {
  const t = new Date(`${iso}T00:00:00`).getTime();
  const s = new Date(`${startIso}T00:00:00`).getTime();
  const e = new Date(`${endIso}T00:00:00`).getTime();
  return t >= s && t <= e;
}

/** Group ISO dates into consecutive ranges for display labels */
function groupIsoDatesIntoRanges(
  dates: string[]
): Array<{ start: string; end: string }> {
  if (!Array.isArray(dates) || dates.length === 0) return [];
  const sorted = [...dates].sort();
  const ranges: Array<{ start: string; end: string }> = [];
  for (let i = 0; i < sorted.length; i++) {
    let start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length) {
      const a = new Date(`${sorted[i]}T00:00:00`);
      const b = new Date(`${sorted[i + 1]}T00:00:00`);
      const diffDays = (b.getTime() - a.getTime()) / 86400000;
      if (diffDays === 1) {
        end = sorted[i + 1];
        i++;
      } else break;
    }
    ranges.push({ start, end });
  }
  return ranges;
}

/** Suppress wallet onCancel warnings */
function ensureGlobalOnCancelNoop(): void {
  const w: any = window;
  if (typeof w.onCancel !== "function") {
    w.onCancel = () => {};
  }
}

/** Load Apple Pay JS if needed */
async function loadApplePaySdk(): Promise<void> {
  const w: any = window;
  if (w.ApplePaySession) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://applepay.cdn-apple.com/jsapi/v1/apple-pay-sdk.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Apple Pay SDK"));
    document.head.appendChild(script);
  });
}

/** Build products array for Embedded Payments JWT */
function buildProductsForJwt(args: {
  booking: BookingLine | null;
  merchItems: MerchItem[];
}) {
  const { booking, merchItems } = args;
  const products: Array<{
    name?: string;
    skuCode?: string;
    quantity?: number;
    price?: number; // unit price used in UI
    amount?: number; // unit price sent to Deluxe
    description?: string;
    unitOfMeasure?: string;
  }> = [];

  const toMoney = (v: unknown): number => {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : 0;
  };

  if (booking) {
    const hunters = Math.max(1, Number(booking.numberOfHunters || 1));
    const partyDays = booking.partyDeckDates?.length || 0;
    const partyRate = booking.seasonConfig?.partyDeckRatePerDay ?? 500;
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
      price: toMoney(perHunterUnit),
      amount: toMoney(perHunterUnit),
      description: `${booking.dates.length} day(s) • ${hunters} hunter(s)`,
      unitOfMeasure: "Each",
    });
    if (partyDays > 0) {
      products.push({
        name: "Party Deck",
        skuCode: "PARTY",
        quantity: partyDays,
        price: toMoney(partyRate),
        amount: toMoney(partyRate),
        unitOfMeasure: "Day",
      });
    }
  }

  for (const m of merchItems) {
    products.push({
      name: m.name,
      skuCode: m.skuCode,
      quantity: m.qty,
      price: toMoney(m.price),
      amount: toMoney(m.price),
      unitOfMeasure: "Each",
    });
  }

  return products;
}

/** Compute totals for booking + merch (whole currency units) */
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
  const { booking, merchItems, isHydrated, clearCart } = useCart();

  const [step, setStep] = useState<1 | 2 | 3>(1);

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

  /** Normalize merch from CartContext into an array of {skuCode, name, qty, price} */
  const merchArray: MerchItem[] = useMemo(() => {
    const arr: MerchItem[] = [];
    const items = merchItems as any;
    const values: any[] = items ? Object.values(items) : [];
    for (const v of values) {
      const sku =
        v?.product?.skuCode ?? v?.product?.id ?? v?.sku ?? v?.id ?? "SKU";
      const name = v?.product?.name ?? v?.name ?? "Item";
      const qty = Number(v?.quantity ?? v?.qty ?? 0);
      const price = Number(v?.product?.price ?? v?.price ?? 0);
      if (!sku || qty <= 0) continue;
      arr.push({ skuCode: String(sku), name: String(name), qty, price });
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

  const customerInfoComplete = useMemo(() => {
    return (
      !!customer.firstName?.trim() &&
      !!customer.lastName?.trim() &&
      !!customer.email?.trim()
    );
  }, [customer.firstName, customer.lastName, customer.email]);

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

  const [sdkReady, setSdkReady] = useState(false);
  const [instanceReady, setInstanceReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("") as unknown as [string, any];
  const instanceRef = useRef(null) as unknown as { current: any };

  /** Build products for the Review step (mirrors the Embedded panel) */
  const reviewProducts = useMemo(() => {
    const products = buildProductsForJwt({
      booking: booking
        ? {
            dates: booking.dates,
            numberOfHunters: booking.numberOfHunters,
            partyDeckDates: booking.partyDeckDates,
            seasonConfig: seasonConfig || undefined,
            bookingTotal: totals.bookingTotal,
          }
        : null,
      merchItems: merchArray,
    });
    return products.map((p) => {
      const quantity = p.quantity || 0;
      const unit =
        typeof p.price === "number" && !isNaN(p.price)
          ? p.price
          : typeof p.amount === "number" && !isNaN(p.amount)
          ? p.amount
          : 0;
      return { ...p, quantity, unit, extended: unit * quantity };
    });
  }, [booking, merchArray, seasonConfig, totals.bookingTotal]);

  const dateRangeLabels = useMemo(() => {
    if (!booking?.dates || booking.dates.length === 0) return [];
    return groupIsoDatesIntoRanges(booking.dates).map(({ start, end }) => {
      if (start === end) return formatLongDate(start, { weekday: true });
      return `${formatLongDate(start, { weekday: true })} – ${formatLongDate(
        end,
        { weekday: true }
      )}`;
    });
  }, [booking?.dates]);

  const partyDeckRangeLabels = useMemo(() => {
    if (!booking?.partyDeckDates || booking.partyDeckDates.length === 0)
      return [];
    return groupIsoDatesIntoRanges(booking.partyDeckDates).map(
      ({ start, end }) => {
        if (start === end) return formatLongDate(start, { weekday: true });
        return `${formatLongDate(start, { weekday: true })} – ${formatLongDate(
          end,
          { weekday: true }
        )}`;
      }
    );
  }, [booking?.partyDeckDates]);

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
      ensureGlobalOnCancelNoop();
      try {
        const inst = instanceRef.current;
        if (inst?.destroy) inst.destroy();
        else if (inst?.unmount) inst.unmount();
        instanceRef.current = null;
      } catch {}

      await ensureOrder();

      // Determine methods (cc/ach) + wallets state
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

      if (applePayEnabled) {
        try {
          await loadApplePaySdk();
        } catch (err) {
          console.warn("Failed to load Apple Pay SDK", err);
        }
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
                  bookingTotal: totals.bookingTotal,
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

      const EP = await waitForEmbeddedPayments();
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

      const initResult = EP.init(jwt, config);
      const handlerHost: any =
        (initResult &&
          typeof initResult.setEventHandlers === "function" &&
          initResult) ||
        (typeof (EP as any).setEventHandlers === "function" && EP) ||
        null;

      if (handlerHost) {
        await Promise.resolve(
          handlerHost.setEventHandlers({
            onTxnSuccess: async (_g: any, data: any) => {
              try {
                const ref = doc(db, "orders", orderId);
                const paymentId =
                  data?.paymentId ??
                  data?.PaymentId ??
                  data?.transactionId ??
                  data?.TransactionId ??
                  data?.transactionRecordId ??
                  data?.TransactionRecordId ??
                  data?.id ??
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

                // Update availability (huntersBooked)
                if (
                  booking &&
                  booking.dates?.length &&
                  booking.numberOfHunters
                ) {
                  const batch = writeBatch(db);
                  for (const date of booking.dates) {
                    const availRef = doc(db, "availability", date);
                    batch.set(
                      availRef,
                      {
                        huntersBooked: increment(booking.numberOfHunters),
                        updatedAt: serverTimestamp(),
                      },
                      { merge: true }
                    );
                  }
                  await batch.commit();
                }

                // Decrement merch inventory (variant-as-SKU)
                if (Array.isArray(merchArray) && merchArray.length) {
                  const invBatch = writeBatch(db);
                  for (const m of merchArray) {
                    if (!m?.skuCode || !m?.qty) continue;
                    invBatch.set(
                      doc(db, "products", m.skuCode),
                      {
                        stock: increment(-Math.abs(m.qty)),
                        updatedAt: serverTimestamp(),
                      },
                      { merge: true }
                    );
                  }
                  await invBatch.commit();
                }
              } catch (err) {
                console.warn(
                  "Failed to persist success event or inventory updates",
                  err
                );
              } finally {
                try {
                  clearCart?.();
                } catch {}
                try {
                  localStorage.removeItem(ORDER_ID_KEY);
                } catch {}
                navigate(`/dashboard?status=paid&orderId=${orderId}`);
              }
            },
            onTxnFailed: (_g: any, data: any) => {
              console.warn("[Deluxe] Failed:", data);
              setErrorMsg("Payment failed. Please try again.");
            },
            onTxnCancelled: (_g: any, data: any) => {
              console.log("[Deluxe] Cancelled:", data);
              setErrorMsg("Payment cancelled.");
            },
            onValidationError: (_g: any, data: any) => {
              console.warn("[Deluxe] Validation error:", data);
              setErrorMsg("Validation error — please check your info.");
            },
            onTokenSuccess: (_g: any, data: any) => {
              console.log("[Deluxe] Token success", data);
            },
            onTokenFailed: (_g: any, data: any) => {
              console.warn("[Deluxe] Token failed", data);
            },
            onCancel: (_g: any, data: any) => {
              console.log("[Deluxe] Payment cancelled", data);
              setErrorMsg("Payment cancelled.");
            },
          })
        );
      } else {
        console.warn(
          "Deluxe: setEventHandlers() not available on this build; continuing without explicit handlers."
        );
      }

      instanceRef.current = handlerHost || EP;

      if (!document.getElementById(EMBEDDED_CONTAINER_ID))
        throw new Error(`Missing container #${EMBEDDED_CONTAINER_ID}`);

      const renderHost: any =
        handlerHost && handlerHost.render ? handlerHost : EP;
      renderHost.render({
        containerId: EMBEDDED_CONTAINER_ID,
        paymentpanelstyle: "light",
        productsbgcolor: "#f7f7f7",
        productsfontcolor: "#333333",
        productsfontsize: "14px",
        walletsbgcolor: "#fafafa",
        walletsborderadius: "8px",
        walletspadding: "12px",
        walletsgap: "8px",
        walletswidth: "100%",
        walletsheight: "auto",
        walletsfontfamily: "var(--font-acumin, sans-serif)",
        walletsfontcolor: "#333333",
        paybuttoncolor: "#4CAF50",
        cancelbuttoncolor: "#f44336",
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
    totals.bookingTotal,
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

  const handleStartSecurePayment = useCallback(async () => {
    setStep(3);
    await new Promise((r) => setTimeout(r, 0));
    await startEmbeddedPayment();
  }, [startEmbeddedPayment]);

  const handleBackToReview = useCallback(() => {
    setErrorMsg("");
    setStep(2);
    try {
      const inst = instanceRef.current;
      if (inst?.destroy) inst.destroy();
      else if (inst?.unmount) inst.unmount();
      instanceRef.current = null;
    } catch {}
    setSdkReady(false);
    setInstanceReady(false);
  }, []);

  useEffect(() => {
    return () => {
      try {
        const inst = instanceRef.current;
        if (inst?.destroy) inst.destroy();
        else if (inst?.unmount) inst.unmount();
        const EP = resolveEP();
        if (EP?.destroy) EP.destroy();
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

      {(errorMsg || (cfgError as any)) && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 p-3">
          {errorMsg || (cfgError as any)}
        </div>
      )}

      <div className="flex items-center justify-center gap-4 mb-8">
        <div className="flex items-center gap-1">
          <div
            className={[
              "w-8 h-8 rounded-full flex items-center justify-center font-semibold",
              step === 1
                ? "bg-[var(--color-accent-sage)] text-white"
                : "bg-gray-200 text-gray-600",
            ].join(" ")}
          >
            1
          </div>
          <span className="hidden sm:inline text-sm">Customer</span>
        </div>
        <div className="w-4 h-px bg-gray-300" />
        <div className="flex items-center gap-1">
          <div
            className={[
              "w-8 h-8 rounded-full flex items-center justify-center font-semibold",
              step === 2
                ? "bg-[var(--color-accent-sage)] text-white"
                : "bg-gray-200 text-gray-600",
            ].join(" ")}
          >
            2
          </div>
          <span className="hidden sm:inline text-sm">Review</span>
        </div>
        <div className="w-4 h-px bg-gray-300" />
        <div className="flex items-center gap-1">
          <div
            className={[
              "w-8 h-8 rounded-full flex items-center justify-center font-semibold",
              step === 3
                ? "bg-[var(--color-accent-sage)] text-white"
                : "bg-gray-200 text-gray-600",
            ].join(" ")}
          >
            3
          </div>
          <span className="hidden sm:inline text-sm">Pay</span>
        </div>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <section className="mb-8 p-4 rounded-xl border bg-neutral-100">
          <h2 className="text-xl mb-4 font-acumin">Customer Info</h2>
          <CustomerInfoForm value={customer} onChange={setCustomer} />
          <div className="mt-6 flex justify-end">
            <button
              disabled={!customerInfoComplete}
              onClick={() => setStep(2)}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent-sage)] text-white disabled:opacity-50"
            >
              Next: Review Order
            </button>
          </div>
        </section>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <section className="mb-8 p-4 rounded-xl border bg-neutral-100">
          <h2 className="text-xl mb-4 font-acumin">Review Your Order</h2>

          <div className="mb-4 p-3 rounded-lg border bg-white/70">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide opacity-60">
                  Hunters
                </div>
                <div className="font-semibold">
                  {booking?.numberOfHunters ?? 0}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide opacity-60">
                  Days
                </div>
                <div className="font-semibold">
                  {booking?.dates?.length ?? 0}
                </div>
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
                      title={label}
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
            {booking?.partyDeckDates?.length ? (
              <div className="mt-3 text-xs">
                <span className="opacity-60 mr-1">Party Deck:</span>
                <span className="font-medium">
                  {partyDeckRangeLabels.join(", ")}
                </span>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left">Item</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {reviewProducts.map((item, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-medium">{item.name}</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">${item.unit.toFixed(2)}</td>
                    <td className="py-2 text-right">
                      ${item.extended.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="text-lg mr-2">Total</div>
            <div className="text-2xl font-bold">${amount.toFixed(2)}</div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              Back
            </button>
            <div className="flex gap-3">
              <button
                disabled={!canStart || isSubmitting}
                onClick={handleStartSecurePayment}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent-sage)] text-white disabled:opacity-50"
              >
                {isSubmitting ? "Starting…" : "Start secure payment"}
              </button>
              <button
                onClick={fallbackHostedCheckout}
                className="hidden px-4 py-2 rounded-lg bg-gray-700 text-white"
              >
                Use hosted checkout
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <section className="mb-8 p-4 rounded-xl border bg-neutral-100">
          <h2 className="text-xl mb-4 font-acumin">Pay Securely (Embedded)</h2>

          <div className="mb-4 p-3 rounded-lg border bg-white/70">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide opacity-60">
                  Hunters
                </div>
                <div className="font-semibold">
                  {booking?.numberOfHunters ?? 0}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide opacity-60">
                  Days
                </div>
                <div className="font-semibold">
                  {booking?.dates?.length ?? 0}
                </div>
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
                      title={label}
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
            {booking?.partyDeckDates?.length ? (
              <div className="mt-3 text-xs">
                <span className="opacity-60 mr-1">Party Deck:</span>
                <span className="font-medium">
                  {partyDeckRangeLabels.join(", ")}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mb-4 flex justify-between items-baseline">
            <div className="text-lg">Total</div>
            <div className="text-2xl font-bold">${amount.toFixed(2)}</div>
          </div>

          <div
            id={EMBEDDED_CONTAINER_ID}
            className={[
              "min-h-[260px] rounded-xl shadow-lg bg-white",
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

          <div className="mt-6 flex justify-start">
            <button
              onClick={handleBackToReview}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              Back to review
            </button>
          </div>
        </section>
      )}

      <p className="text-xs text-white opacity-80">
        By paying, you agree to the ranch’s property rules and cancellation
        policy.
      </p>
    </div>
  );
}
