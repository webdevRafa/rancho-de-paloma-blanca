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

// Allow for a global lexical binding in some SDK builds
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
  /**
   * Subtotal for this booking.  When provided, this value will be used to
   * calculate per‑hunter pricing for the embedded payments products array.  If
   * omitted, the hunt package line will default to zero, which causes the
   * embedded panel to display $NaN for that line.  Make sure to include
   * `bookingTotal` when calling `buildProductsForJwt`.
   */
  bookingTotal?: number;
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

/**
 * Ensure a global onCancel handler exists.  Some builds of the Deluxe SDK will
 * attempt to invoke window.onCancel when a wallet checkout is cancelled.  If
 * it isn't defined, the browser logs a warning.  Defining a no‑op handler
 * silences the warning without changing behaviour.
 */
function ensureGlobalOnCancelNoop() {
  const w = window as any;
  if (typeof w.onCancel !== "function") {
    w.onCancel = () => {};
  }
}

/**
 * Load the Apple Pay JavaScript SDK.  Deluxe will display an Apple Pay button
 * if the merchant account and browser support it, but only after the Apple
 * Pay SDK has been loaded.  Without this script, Safari logs
 * "Applepay SDK is not loaded" and the button never appears.  This helper
 * loads the script once; subsequent calls resolve immediately.  If the
 * script fails to load, the returned promise rejects and the caller may
 * optionally ignore the error (the button will remain hidden).
 */
async function loadApplePaySdk(): Promise<void> {
  if ((window as any).ApplePaySession) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://applepay.cdn-apple.com/jsapi/v1/apple-pay-sdk.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Apple Pay SDK"));
    document.head.appendChild(script);
  });
}

/**
 * Group an array of ISO date strings into consecutive ranges.  Each range
 * represents one or more dates that are adjacent on the calendar.  This
 * helper sorts the dates before grouping and returns an array of
 * { start: string, end: string } objects.
 */
function groupIsoDatesIntoRanges(
  dates: string[]
): Array<{ start: string; end: string }> {
  if (!Array.isArray(dates) || dates.length === 0) return [];
  const sorted = [...dates].sort();
  const out: Array<{ start: string; end: string }> = [];
  for (let i = 0; i < sorted.length; i++) {
    let start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length) {
      const a = new Date(`${sorted[i]}T00:00:00`);
      const b = new Date(`${sorted[i + 1]}T00:00:00`);
      const isNextDay = (b.getTime() - a.getTime()) / 86400000 === 1;
      if (!isNextDay) break;
      end = sorted[++i];
    }
    out.push({ start, end });
  }
  return out;
}

/**
 * Inject custom styles for the Deluxe embedded panel.  Without these styles
 * the default layout leaves a blank thumbnail placeholder and aligns the
 * container to the far left on large screens.  Centering the panel and
 * removing unused thumbnails results in a cleaner, more professional look.
 * This helper ensures a single style tag is added to the document head.
 */
function ensureEmbeddedStyles() {
  const styleId = "rdpb-embedded-styles";
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    /* Center the entire embedded form within its container */
    #${EMBEDDED_CONTAINER_ID} .embedded-form-container {
      max-width: 720px;
      margin-left: auto;
      margin-right: auto;
    }
    /* Hide the blank product thumbnail and adjust spacing */
    #${EMBEDDED_CONTAINER_ID} .product-thumbnail {
      display: none !important;
    }
    #${EMBEDDED_CONTAINER_ID} .product-info {
      margin-left: 0 !important;
      padding-left: 0 !important;
    }
    /* Improve readability on smaller screens */
    @media (max-width: 480px) {
      #${EMBEDDED_CONTAINER_ID} .summary-title {
        font-size: 1rem !important;
      }
      #${EMBEDDED_CONTAINER_ID} .summary-attribute {
        font-size: 0.875rem !important;
      }
    }
  `;
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
    // indirect eval to access global lexical bindings
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

function buildProductsForJwt(args: {
  booking: BookingLine | null;
  merchItems: MerchItem[];
}) {
  const { booking, merchItems } = args;
  const products: Array<{
    name?: string;
    skuCode?: string;
    quantity?: number;
    price?: number; // unit price per item
    description?: string;
    unitOfMeasure?: string;
  }> = [];

  // If there is a booking, include a line for the hunt and optionally the party deck.
  if (booking) {
    const hunters = Math.max(1, Number(booking.numberOfHunters || 1));
    // Party deck subtotal: number of party deck days times the configured rate.  Default to 500 if seasonConfig undefined.
    const partyDays = booking.partyDeckDates?.length || 0;
    const partyRate = booking.seasonConfig?.partyDeckRatePerDay ?? 500;
    const partySubtotal = partyDays * partyRate;
    // Total for the booking portion (may be undefined).  Use 0 if missing.
    const bookingSubtotal = Number(booking.bookingTotal || 0);
    // Compute per‑hunter unit price by subtracting the party deck subtotal and dividing by hunters.
    const perHunterUnit = Math.max(
      0,
      Math.round((bookingSubtotal - partySubtotal) / hunters)
    );
    products.push({
      name: "Dove Hunt Package",
      skuCode: "HUNT",
      quantity: hunters,
      price: perHunterUnit,
      description: `${booking.dates.length} day(s) • ${hunters} hunter(s)`,
      unitOfMeasure: "Each",
    });
    // If the party deck is reserved for any days, add a separate line.
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

  // Add each merch item.  Note: price must be a unit price (not extended).
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

  // Compute booking and merch totals.  We keep the full totals object so we can
  // reference bookingTotal later when building the products array for the embedded
  // panel.  Amount is extracted from totals.amount for convenience.
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

  // Build friendly date labels for booked hunt dates and party deck dates.  We
  // group consecutive dates into ranges and use formatLongDate to produce
  // human‑readable labels (e.g. "Wed, September 17th, 2025" or
  // "Wed, September 17th, 2025 – Fri, September 19th, 2025").
  const dateRangeLabels = useMemo(() => {
    if (!booking?.dates || booking.dates.length === 0) return [] as string[];
    return groupIsoDatesIntoRanges(booking.dates).map(({ start, end }) => {
      if (start === end) {
        return formatLongDate(start, { weekday: true });
      }
      return `${formatLongDate(start, { weekday: true })} – ${formatLongDate(
        end,
        { weekday: true }
      )}`;
    });
  }, [booking?.dates]);

  const partyDeckRangeLabels = useMemo(() => {
    if (!booking?.partyDeckDates || booking.partyDeckDates.length === 0)
      return [] as string[];
    return groupIsoDatesIntoRanges(booking.partyDeckDates).map(
      ({ start, end }) => {
        if (start === end) {
          return formatLongDate(start, { weekday: true });
        }
        return `${formatLongDate(start, { weekday: true })} – ${formatLongDate(
          end,
          { weekday: true }
        )}`;
      }
    );
  }, [booking?.partyDeckDates]);

  const [sdkReady, setSdkReady] = useState(false);
  const [instanceReady, setInstanceReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("") as unknown as [string, any];
  const instanceRef = useRef(null) as unknown as { current: any };

  // Step control: 1 = customer info, 2 = review, 3 = pay.  We start on the
  // customer step.  Users can navigate between steps to review or edit
  // information before initiating payment.
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Inject a small stylesheet to hide the default thumbnail placeholder in the
  // embedded products list.  Without this, the panel shows a blank white
  // square before each product name.  By removing the element and adjusting
  // margins, the UI looks cleaner, especially on mobile.  Cleanup the style
  // when the component unmounts to avoid leaking styles into other pages.
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.id = "embedded-payments-custom-style";
    styleEl.textContent = `
      /* Hide product thumbnails */
      #${EMBEDDED_CONTAINER_ID} .product-thumbnail {
        display: none !important;
      }
      /* Remove left margin on the product info when thumbnail is hidden */
      #${EMBEDDED_CONTAINER_ID} .product-info {
        margin-left: 0 !important;
      }
    `;
    document.head.appendChild(styleEl);
    return () => {
      try {
        styleEl.parentElement?.removeChild(styleEl);
      } catch {}
    };
  }, []);

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
      // destroy any earlier instance
      try {
        const inst = instanceRef.current;
        if (inst?.destroy) inst.destroy();
        else if (inst?.unmount) inst.unmount();
        instanceRef.current = null;
      } catch {}

      // ensure order
      await ensureOrder();

      // figure out which methods to show
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

      // get short-lived JWT
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
                  // Include bookingTotal so per‑hunter pricing can be computed.
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

      // load the SDK from the correct base
      const scriptSrc = embeddedBase
        ? `${embeddedBase}/embedded/javascripts/deluxe.js`
        : undefined;
      await loadDeluxeSdk(scriptSrc);

      // resolve EP object and init
      const EP = await waitForEmbeddedPayments();
      setSdkReady(true);
      // Provide global no‑op cancel handler to silence wallet warnings and load
      // Apple Pay JS if enabled.  These helpers must run after the SDK
      // script loads but before calling init().
      ensureGlobalOnCancelNoop();
      if (applePayEnabled) {
        try {
          await loadApplePaySdk();
        } catch (e) {
          console.warn("Apple Pay SDK failed to load", e);
        }
      }

      // Inject custom styles for the embedded panel.  This call adds a
      // single style tag to the document head to center the panel, hide the
      // blank thumbnail, and improve readability across breakpoints.  See
      // ensureEmbeddedStyles() for details.
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

      // IMPORTANT: init may return void OR an instance; setEventHandlers may exist on EP or return value.
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
                // Extract a reasonable payment identifier from various possible fields on the
                // event.  Some gateways return PaymentId or TransactionId rather than
                // paymentId (case sensitivity differs), so check a few options.  If
                // nothing matches, this will remain null.
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

                // Increment huntersBooked for each booked date.  This mirrors the
                // behaviour performed in the server-side webhook for hosted
                // payments.  It ensures availability is updated immediately for
                // embedded checkout, even if a webhook is not received.
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
              } catch (err) {
                console.warn(
                  "Failed to record Deluxe lastEvent or update availability",
                  err
                );
              }
              navigate(`/dashboard?status=paid&orderId=${orderId}`);
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
            // Some builds of the Deluxe SDK emit an onCancel event (especially for
            // digital wallets).  Define a no‑op handler to suppress console
            // warnings like "onCancel is not defined".
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
      // Customize the embedded form styling.  See Deluxe documentation for
      // additional options such as walletsbgcolor, walletsborderadius, etc.
      renderHost.render({
        containerId: EMBEDDED_CONTAINER_ID,
        // Use the light theme for consistency with our site design.
        paymentpanelstyle: "light",
        // Products panel styling: white background, dark text, comfortable font size.
        productsbgcolor: "#ffffff",
        productsfontcolor: "#333333",
        productsfontsize: "14px",
        // Wallet panel styling: light background, rounded corners and generous padding.
        walletsbgcolor: "#ffffff",
        walletsfontcolor: "#333333",
        walletsborderradius: "8px",
        walletspadding: "12px",
        walletsgap: "12px",
        walletswidth: "100%",
        // Buttons: match our brand palette (green pay button, muted cancel button).
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

  // Build the products array for the review panel.  This mirrors what we
  // will send to the server for the JWT but includes per‑hunter pricing via
  // totals.bookingTotal.  We compute this once per render for the review
  // screen.
  const reviewProducts = useMemo(() => {
    return buildProductsForJwt({
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
  }, [booking, merchArray, seasonConfig, totals.bookingTotal]);

  // Disable the "Next" button on step 1 if required customer info is missing.
  const customerInfoComplete = Boolean(
    customer.firstName && customer.lastName && customer.email
  );

  // Handler to return from the pay step back to the review step.  We tear
  // down any existing Deluxe instance to avoid duplicate panels and reset
  // readiness flags.
  const handleBackToReview = useCallback(() => {
    try {
      const inst = instanceRef.current;
      if (inst?.destroy) inst.destroy();
      else if (inst?.unmount) inst.unmount();
      instanceRef.current = null;
      const EP = resolveEP();
      if (EP?.destroy) EP.destroy();
    } catch (err) {
      console.warn("Failed to destroy embedded instance", err);
    }
    setSdkReady(false);
    setInstanceReady(false);
    setStep(2);
  }, []);

  // When the user clicks "Start secure payment" on the review step, advance
  // to step 3 then trigger the embedded payment initialization.  We wait one
  // tick after changing steps to allow the embedded container to mount in
  // the DOM before starting the SDK.  Without this, the SDK may render
  // into a stale or missing container.
  const handleStartSecurePayment = useCallback(async () => {
    setStep(3);
    // Allow the DOM to update with the new container before starting
    await new Promise((resolve) => setTimeout(resolve, 0));
    await startEmbeddedPayment();
  }, [startEmbeddedPayment]);

  if (!isHydrated) {
    return <div className="text-center py-20">Loading cart…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-3xl font-semibold font-acumin">Checkout</h1>
        <p className="text-sm opacity-70">
          Order ID: <span className="font-mono">{orderId}</span>
        </p>
      </div>

      {/* Display any error messages */}
      {(errorMsg || (cfgError as any)) && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 p-3">
          {errorMsg || (cfgError as any)}
        </div>
      )}

      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-4">
        <div
          className={
            "flex items-center gap-1 px-3 py-1 rounded-full text-sm " +
            (step === 1
              ? "bg-[var(--color-accent-sage)] text-white"
              : "bg-neutral-200 text-neutral-600")
          }
        >
          <span className="font-bold">1</span>
          <span className="hidden sm:inline">Customer</span>
        </div>
        <div
          className={
            "flex items-center gap-1 px-3 py-1 rounded-full text-sm " +
            (step === 2
              ? "bg-[var(--color-accent-sage)] text-white"
              : "bg-neutral-200 text-neutral-600")
          }
        >
          <span className="font-bold">2</span>
          <span className="hidden sm:inline">Review</span>
        </div>
        <div
          className={
            "flex items-center gap-1 px-3 py-1 rounded-full text-sm " +
            (step === 3
              ? "bg-[var(--color-accent-sage)] text-white"
              : "bg-neutral-200 text-neutral-600")
          }
        >
          <span className="font-bold">3</span>
          <span className="hidden sm:inline">Pay</span>
        </div>
      </div>

      {/* Step 1: Customer Info */}
      {step === 1 && (
        <section className="mb-8 p-4 rounded-xl border bg-neutral-100">
          <h2 className="text-xl mb-4 font-acumin">Customer Info</h2>
          <CustomerInfoForm value={customer} onChange={setCustomer} />
          {/* Total at bottom of step 1 */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-lg font-semibold">Total</div>
            <div className="text-2xl font-bold">${amount.toFixed(2)}</div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              disabled={!customerInfoComplete}
              onClick={() => setStep(2)}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent-sage)] text-white disabled:opacity-50"
            >
              Next: Review
            </button>
          </div>
        </section>
      )}

      {/* Step 2: Review */}
      {step === 2 && (
        <section className="mb-8 p-4 rounded-xl border bg-neutral-100">
          <h2 className="text-xl mb-4 font-acumin">Review Order</h2>
          {/* Summary of hunt details */}
          {booking && (
            <div className="mb-4 grid sm:grid-cols-3 gap-3">
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
                  {dateRangeLabels.length > 0 ? (
                    dateRangeLabels.map((label, i) => (
                      <span
                        key={i}
                        className="inline-block px-2 py-1 rounded-full bg-neutral-200 border text-xs"
                      >
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs opacity-70">—</span>
                  )}
                </div>
              </div>
              {booking.partyDeckDates && booking.partyDeckDates.length > 0 && (
                <div className="col-span-full">
                  <div className="text-[11px] uppercase tracking-wide opacity-60">
                    Party Deck
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {partyDeckRangeLabels.map((label, i) => (
                      <span
                        key={i}
                        className="inline-block px-2 py-1 rounded-full bg-neutral-200 border text-xs"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Itemized products */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Items</h3>
            <div className="divide-y divide-neutral-200">
              {reviewProducts.map((p, i) => (
                <div key={i} className="py-2 flex justify-between items-start">
                  <div className="pr-2">
                    <div className="font-medium">{p.name}</div>
                    {p.description && (
                      <div className="text-xs opacity-70">{p.description}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm">
                      {p.quantity} × ${p.price?.toFixed(2)}
                    </div>
                    <div className="font-semibold">
                      $
                      {(p.price || 0) * (p.quantity || 0) === 0
                        ? (p.price || 0) * (p.quantity || 0)
                        : ((p.price || 0) * (p.quantity || 0)).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Review totals */}
          <div className="mb-4 flex justify-end">
            <div className="text-lg font-semibold mr-2">Total:</div>
            <div className="text-2xl font-bold">${amount.toFixed(2)}</div>
          </div>
          {/* Navigation buttons */}
          <div className="mt-4 flex justify-between flex-wrap gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded-lg border"
            >
              Back
            </button>
            <button
              disabled={!canStart || isSubmitting}
              onClick={handleStartSecurePayment}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent-sage)] text-white disabled:opacity-50"
            >
              {isSubmitting ? "Starting…" : "Start secure payment"}
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Pay */}
      {step === 3 && (
        <section className="mb-8 p-4 rounded-xl border bg-neutral-100">
          <h2 className="text-xl mb-4 font-acumin">Pay Securely (Embedded)</h2>
          {/* Quick summary */}
          {booking && (
            <div className="mb-4 grid sm:grid-cols-3 gap-3">
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
                  {dateRangeLabels.length > 0 ? (
                    dateRangeLabels.map((label, i) => (
                      <span
                        key={i}
                        className="inline-block px-2 py-1 rounded-full bg-neutral-200 border text-xs"
                      >
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs opacity-70">—</span>
                  )}
                </div>
              </div>
              {booking.partyDeckDates && booking.partyDeckDates.length > 0 && (
                <div className="col-span-full">
                  <div className="text-[11px] uppercase tracking-wide opacity-60">
                    Party Deck
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {partyDeckRangeLabels.map((label, i) => (
                      <span
                        key={i}
                        className="inline-block px-2 py-1 rounded-full bg-neutral-200 border text-xs"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="mb-4 flex justify-between items-center">
            <div className="text-lg font-semibold">Total</div>
            <div className="text-2xl font-bold">${amount.toFixed(2)}</div>
          </div>
          <div
            id={EMBEDDED_CONTAINER_ID}
            className={[
              "min-h-[240px] rounded-xl shadow-lg bg-white mb-6",
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
          <div className="mt-4 flex justify-start">
            <button
              onClick={handleBackToReview}
              className="px-4 py-2 rounded-lg border"
            >
              Back to review
            </button>
          </div>
        </section>
      )}

      {/* Footer note */}
      <p className="text-xs opacity-60">
        By paying, you agree to the ranch’s property rules and cancellation
        policy.
      </p>
    </div>
  );
}
