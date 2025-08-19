import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import CustomerInfoForm from "../components/CustomerInfoForm";
// Pull in the CustomerInfoForm component. We do not import its types
// because within this isolated environment those modules are treated as
// `any` by the TypeScript compiler. Instead, we define the
// corresponding types locally below.
import { getSeasonConfig } from "../utils/getSeasonConfig";

// Define lightweight versions of external types used by this component.
// When integrating into the real application you should import these from
// their respective modules instead. See Types.ts and CustomerInfoForm for
// the canonical definitions.
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
  /** inclusive ISO yyyy-mm-dd start of the season */
  seasonStart: string;
  /** inclusive ISO yyyy-mm-dd end of the season */
  seasonEnd: string;
  /** per‑person weekday rate */
  weekdayRate?: number;
  /** per‑person weekend rate configurations */
  weekendRates?: {
    singleDay: number;
    twoConsecutiveDays: number;
    threeDayCombo: number;
  };
  /** optional per‑day party deck rental rate */
  partyDeckRatePerDay?: number;
};

/**
 * CheckoutPage.tsx
 *
 * A production-ready checkout implementation leveraging Deluxe Embedded Payments as the
 * primary collection mechanism with hosted payment links as a fallback. This
 * component calculates totals for bookings and merchandise, persists order
 * information to Firestore, and manages lifecycle of the EmbeddedPayments SDK.
 *
 * The types declared here mirror those in our Types.ts/MerchTypes.ts modules.
 */

// Extend the Window interface for the Deluxe SDK. The embedded script attaches
// `EmbeddedPayments` at runtime. We use `any` here since the SDK does not ship
// official TypeScript definitions.
declare global {
  interface Window {
    EmbeddedPayments?: any;
  }
}

// ---- Local Types (align with Types.ts / Order schema) ----
type BookingLine = {
  /** The days the hunt is booked (ISO YYYY-MM-DD). */
  dates: string[];
  /** Number of hunters participating. */
  numberOfHunters: number;
  /** Optional subset of dates where the party deck is reserved. */
  partyDeckDates?: string[];
  /** Copy of the season configuration used for auditing. */
  seasonConfig?: SeasonConfig;
};

type MerchItem = {
  skuCode: string;
  name: string;
  qty: number;
  /** Unit price in whole currency units (no cents). */
  price: number;
};

type OrderDoc = {
  userId: string;
  status: "pending" | "paid" | "cancelled";
  /**
   * Grand total in whole currency units. For example, 200 corresponds to $200.00.
   */
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
      country?: string; // two‑letter ISO country code
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

// Storage key for persisting a generated order ID. Keeping this constant
// outside of the component allows reuse across navigations. When used in
// combination with a user ID (if available) the risk of collisions is
// minimized. See the useState hook for how this constant is applied.
const ORDER_ID_KEY = "rdpb:orderId";

// The DOM id used to host the embedded payment panel. If you modify this
// identifier here, also update the matching attribute in the render method.
const EMBEDDED_CONTAINER_ID = "embeddedpayments";

/**
 * Dynamically injects the Deluxe Embedded Payments SDK. The correct
 * environment (production or sandbox) is inferred at runtime based on the
 * hostname. If the script has already been added to the document, the
 * existing script's load events are used; otherwise a new <script> element
 * is appended to <head>. The promise resolves once window.EmbeddedPayments
 * is available.
 *
 * @param src override the default script URL; useful for testing
 */
function loadDeluxeSdk(src?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // If the SDK is already attached, resolve immediately.
    if (window.EmbeddedPayments) return resolve();

    // Determine which script URL to load if none is provided. We consider
    // localhost, 127.x.x.x and ::1 as development hosts.
    const hostname = window.location.hostname;
    const isProd = hostname && !/^(localhost|127\.|\[::1\])/.test(hostname);
    const defaultSrc = isProd
      ? "https://payments.deluxe.com/embedded/javascripts/deluxe.js"
      : "https://payments2.deluxe.com/embedded/javascripts/deluxe.js";
    const url = src || defaultSrc;

    // If a script with the same src is already present, listen for its load/error.
    const existing = document.querySelector(
      `script[src="${url}"]`
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Deluxe SDK"))
      );
      return;
    }
    // Otherwise create a new script element.
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Deluxe SDK"));
    document.head.appendChild(script);
  });
}

/**
 * Returns true if the second ISO date is exactly one day after the first. This
 * helper is used when grouping consecutive weekend days for special pricing.
 */
function isConsecutive(d0: string, d1: string): boolean {
  const a = new Date(`${d0}T00:00:00`);
  const b = new Date(`${d1}T00:00:00`);
  const diff = (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
  return diff === 1;
}

/** Returns a new array of ISO dates sorted in ascending order. */
function sortIsoDates(dates: string[]): string[] {
  return [...dates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Returns true if iso is within the inclusive range [startIso, endIso]. */
function inRange(iso: string, startIso: string, endIso: string) {
  const t = new Date(`${iso}T00:00:00`).getTime();
  const s = new Date(`${startIso}T00:00:00`).getTime();
  const e = new Date(`${endIso}T00:00:00`).getTime();
  return t >= s && t <= e;
}

/**
 * Constructs the array of product objects consumed by Deluxe's Embedded JWT.
 * Both booking and merchandise items are represented. When booking is present
 * the description conveys the number of days and hunters.
 */
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
      price: 0, // pricing is rolled into the overall total
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

/**
 * Computes the per-person cost for a set of booking dates based on a season
 * configuration. When cfg is null, sensible defaults are applied. The return
 * value includes individual subtotals for booking and merchandise as well as
 * the combined amount due. All values are whole currency units (no cents).
 */
function calculateTotals(args: {
  booking: BookingLine | null;
  merchItems: MerchItem[];
  cfg: SeasonConfig | null;
}) {
  const { booking, merchItems, cfg } = args;

  // Merchandise subtotal
  const merchTotal = merchItems.reduce((sum, m) => sum + m.price * m.qty, 0);

  // Booking subtotal
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
        // Sept 6 – Oct 26 default season (inclusive).  Note: months are 0-indexed.
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

    // Off-season days are billed at the weekday rate (per person).
    const offSeasonDays = all.filter((d) => !isInSeason(d));
    bookingTotal +=
      offSeasonDays.length * weekdayRate * (booking.numberOfHunters || 1);

    // In-season days may qualify for special weekend pricing combos. We process
    // consecutive days in order to group 2- and 3-day packages. The
    // seasonCostPerPerson accumulator holds the subtotal per hunter.
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

      // 3-day Fri–Sun combo
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
      // 2 consecutive days combo (e.g., Fri+Sat or Sat+Sun)
      if (d0 && d1 && isConsecutive(d0, d1)) {
        seasonCostPerPerson += wkRates.twoConsecutiveDays;
        i += 2;
        continue;
      }
      // Single in-season day
      if (d0) {
        seasonCostPerPerson += wkRates.singleDay;
        i += 1;
        continue;
      }
      i++;
    }
    bookingTotal += seasonCostPerPerson * (booking.numberOfHunters || 1);

    // Party deck: fixed rate per selected day regardless of season
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

  /**
   * Generate or retrieve a persisted orderId. If crypto.randomUUID is not
   * available (e.g. in very old browsers), a simple fallback based on
   * Math.random is used. The orderId is stored in localStorage using a
   * fixed key. In a future iteration this key could incorporate the
   * authenticated user's UID to avoid collisions when multiple users
   * share the same browser.
   */
  // When not using the React type definitions, the generic form of useState
  // (i.e. useState<string>()) is invalid because the imported function is
  // typed as `any`. To avoid "untagged function calls may not accept type
  // arguments" errors we call useState without a type parameter and cast
  // the return value. The stored orderId is always a string.
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

  // Season configuration state loaded asynchronously from our utility helper.
  // See note above on generics: we avoid specifying the type argument when
  // the imported hook is typed as `any`. Cast the initial state to the
  // appropriate union type instead.
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

  // Convert the cart's merchandise record into a flat array. Each key in
  // merchItems corresponds to a product with its own quantity and price.
  const merchArray: MerchItem[] = useMemo(() => {
    /**
     * The cart's merchandise state can be represented in a variety of ways
     * depending on the calling context. In our implementation the values
     * returned from `useCart().merchItems` are keyed objects rather than a
     * simple array, so we iterate over the object's values to build an
     * array of MerchItem objects. Because the type signature for
     * `merchItems` is opaque (i.e. it is typed as `unknown` coming from
     * the context) we cast each entry to `any` before accessing its
     * properties. Without this cast TypeScript will emit errors such as
     * "Property 'product' does not exist on type 'unknown'". See issue
     * https://github.com/microsoft/TypeScript/issues/43467 for details.
     */
    const arr: MerchItem[] = [];
    const items = merchItems as any;
    // Guard against undefined/null by defaulting to an empty object
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

  // Initialize the customer state with defaults from the authenticated user if
  // available. When the customer changes their info in the form, this state
  // updates accordingly.
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

  // Memoized total calculations. Whenever booking, merchArray, or the
  // seasonConfig change, recompute the totals. If booking is null we pass
  // null through to calculateTotals.
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

  // UI state flags controlling the embedded payment lifecycle.
  const [sdkReady, setSdkReady] = useState(false);
  const [instanceReady, setInstanceReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("") as unknown as [string, any];

  // Keep a reference to the EmbeddedPayments instance so that we can
  // unmount/destroy it when the component unmounts or when a new payment
  // session begins. Without cleanup, stray event listeners could persist.
  // See note above on generics: avoid specifying type arguments on hooks
  // when React types are unavailable. Cast the result of useRef to the
  // desired shape instead.
  const instanceRef = useRef(null) as unknown as { current: any };

  /**
   * Ensure that a corresponding order document exists in Firestore. If the
   * document does not exist it is created; otherwise it is merged with
   * updated totals and customer information. This function is invoked prior
   * to initiating either embedded or hosted payments.
   */
  const ensureOrder = useCallback(async () => {
    const ref = doc(db, "orders", orderId);
    const snap = await getDoc(ref);
    // Build up a base OrderDoc. We always include createdAt on initial
    // creation and updatedAt on subsequent updates to aid sorting in the
    // dashboard.
    const base: OrderDoc = {
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

  /**
   * Starts the embedded payment flow. This function validates required
   * customer fields, ensures the order document exists, generates a JWT
   * server-side, loads the Deluxe SDK, initializes a new payment instance,
   * registers event handlers, and finally renders the payment panel.
   */
  const startEmbeddedPayment = useCallback(async () => {
    setErrorMsg("");
    // Basic validation: ensure minimal customer info is present
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
      // (1) Persist/merge the order
      await ensureOrder();

      // (2) Determine which payment methods to request. We default to only credit
      // card payments. If the API indicates ACH is enabled for the merchant
      // account we include it as well. Errors in this call are logged but do
      // not block the payment flow.
      let paymentMethods: ("cc" | "ach")[] = ["cc"];
      try {
        const statusResp = await fetch("/api/getEmbeddedMerchantStatus");
        if (statusResp.ok) {
          const status = await statusResp.json();
          if (status?.achEnabled) paymentMethods = ["cc", "ach"];
        }
      } catch (err) {
        console.warn("Failed to fetch merchant status", err);
      }

      // (3) Request a short-lived JWT from our backend. The backend is
      // responsible for signing the JWT using the Deluxe secret and embedding
      // relevant order details. Should the request fail we propagate the
      // error message.
      const jwtResp = await fetch("/api/createEmbeddedJwt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
                  .toUpperCase() || "US",
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
          summary: { hide: false, hideTotals: false },
        }),
      });
      if (!jwtResp.ok) {
        const txt = await jwtResp.text();
        throw new Error(`JWT error ${jwtResp.status}: ${txt}`);
      }
      const { jwt } = await jwtResp.json();
      if (!jwt) throw new Error("JWT missing from response");

      // (4) Load the Deluxe SDK script corresponding to the environment.
      await loadDeluxeSdk();
      setSdkReady(true);

      // (5) Initialize the payment instance. The configuration includes
      // country/currency codes, the requested payment methods and wallet
      // networks, and 3DS capabilities. The Google Pay environment is
      // automatically selected based on the hostname by loadDeluxeSdk.
      const hostname = window.location.hostname;
      const isProd = hostname && !/^(localhost|127\.|\[::1\])/.test(hostname);
      const config = {
        countryCode: "US",
        currencyCode: "USD",
        paymentMethods,
        supportedNetworks: ["visa", "masterCard", "amex", "discover"],
        googlePayEnv: isProd ? "PRODUCTION" : "TEST",
        merchantCapabilities: ["supports3DS"],
        allowedCardAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
      } as any;
      const instance = await window.EmbeddedPayments!.init(jwt, config);
      instanceRef.current = instance;

      // (6) Register event handlers. On successful payment we update the order
      // document with the last event then navigate to the dashboard. On
      // cancellation or failure we surface an error to the user.
      await instance.setEventHandlers({
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

      // (7) Render the payment panel. Style options are included here to
      // demonstrate customization of the wallets section. Note that the
      // containerId must match the DOM id defined in EMBEDDED_CONTAINER_ID.
      instance.render({
        containerId: EMBEDDED_CONTAINER_ID,
        paymentpanelstyle: "light",
        walletsbgcolor: "#000",
        walletsborderradius: "10px",
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

  /**
   * Initiates the hosted checkout fallback. This method first ensures the
   * order document exists, then calls our backend to create a hosted
   * payment session. The backend returns a paymentUrl which we redirect
   * the browser to. Errors during creation are surfaced to the user.
   */
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

  // On unmount we clean up any EmbeddedPayments instance that was created.
  useEffect(() => {
    return () => {
      try {
        const inst = instanceRef.current;
        if (inst?.destroy) inst.destroy();
        else if (inst?.unmount) inst.unmount();
        else if (window.EmbeddedPayments?.destroy) {
          window.EmbeddedPayments.destroy();
        }
      } catch (err) {
        // Silently ignore cleanup errors
      }
    };
  }, []);

  // Determine if the primary payment flow can be initiated. A non-zero amount
  // and a known orderId are required before we allow the user to start.
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
        <h2 className="text-xl mb-4">Customer Info</h2>
        <CustomerInfoForm value={customer} onChange={setCustomer} />
        <div className="mt-10 p-4">
          <h2 className="text-xl mb-3">Order Summary</h2>
          <div className="flex items-center justify-between">
            <div>Total</div>
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
