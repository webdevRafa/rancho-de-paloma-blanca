// CartContext.tsx
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { Product } from "../types/MerchTypes";
import type { NewBooking } from "../types/Types";
import { getSeasonConfig } from "../utils/getSeasonConfig";

type MerchCartItem = {
  product: Product;
  quantity: number;
};

// Adapter for Deluxe Level 3 style line items
type Level3Item = {
  skuCode?: string;
  name?: string;
  description?: string;
  quantity: number;
  price: number; // currency units (e.g., 200 = $200.00)
  unitOfMeasure?: string; // defaults to "Each"
};

interface CartContextType {
  numberOfHunters: number;
  selectedDates: string[];
  partyDeckDates: string[];
  merchItems: Record<string, MerchCartItem>;
  booking: Omit<NewBooking, "createdAt"> | null;
  calculateBookingTotal: () => number;
  cartTotal: () => number;
  total: number;
  level3Items: Level3Item[];
  cart: {
    orderId?: string;
    booking: Omit<NewBooking, "createdAt"> | null;
    merchItems: Record<string, MerchCartItem>;
  };
  setNumberOfHunters: (n: number) => void;
  setSelectedDates: (d: string[]) => void;
  setPartyDeckDates: (d: string[]) => void;
  addOrUpdateMerchItem: (product: Product, quantity: number) => void;
  setBooking: (b: Omit<NewBooking, "createdAt">) => void;
  resetCart: () => void;
  clearCart: () => void;
  isHydrated: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_KEY = "rdp_cart";

type RawSeasonConfig = {
  seasonStart?: string;
  seasonEnd?: string;
  maxHuntersPerDay?: number;
  weekdayRate?: number;
  offSeasonRate?: number;
  partyDeckRatePerDay?: number;
  weekendRates?: {
    singleDay?: number;
    twoConsecutiveDays?: number;
    threeDayCombo?: number;
  };
  // legacy keys we’ll tolerate
  weekendSingleDayRate?: number;
  twoDayConsecutiveRate?: number;
  threeDayFriSatSunRate?: number;
  partyDeckPrice?: number;
};

const normalizeConfig = (cfg?: RawSeasonConfig) => {
  const single =
    cfg?.weekendRates?.singleDay ?? cfg?.weekendSingleDayRate ?? 125;
  const twoDay =
    cfg?.weekendRates?.twoConsecutiveDays ?? cfg?.twoDayConsecutiveRate ?? 350;
  const threeDay =
    cfg?.weekendRates?.threeDayCombo ?? cfg?.threeDayFriSatSunRate ?? 450;

  return {
    seasonStart: cfg?.seasonStart,
    seasonEnd: cfg?.seasonEnd,
    weekdayRate: cfg?.weekdayRate ?? 125,
    offSeasonRate: cfg?.offSeasonRate ?? 125,
    partyDeckPerDay: cfg?.partyDeckRatePerDay ?? cfg?.partyDeckPrice ?? 500,
    weekend: {
      singleDay: single,
      twoConsecutiveDays: twoDay,
      threeDayCombo: threeDay,
    },
  };
};

const isISO = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};
const isInSeason = (
  d: Date,
  cfg: { seasonStart?: string; seasonEnd?: string }
) => {
  if (!isISO(cfg.seasonStart) || !isISO(cfg.seasonEnd)) return true;
  const t = new Date(d).setHours(0, 0, 0, 0);
  const start = toDate(cfg.seasonStart!).setHours(0, 0, 0, 0);
  const end = toDate(cfg.seasonEnd!).setHours(0, 0, 0, 0);
  return t >= start && t <= end;
};

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [isHydrated, setIsHydrated] = useState(false);

  const [numberOfHunters, setNumberOfHunters] = useState(1);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [partyDeckDates, setPartyDeckDates] = useState<string[]>([]);
  const [merchItems, setMerchItems] = useState<Record<string, MerchCartItem>>(
    {}
  );
  const [booking, setBooking] = useState<Omit<NewBooking, "createdAt"> | null>(
    null
  );
  const [seasonCfg, setSeasonCfg] = useState<ReturnType<
    typeof normalizeConfig
  > | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const raw = (await getSeasonConfig()) as RawSeasonConfig;
        setSeasonCfg(normalizeConfig(raw));
      } catch {
        setSeasonCfg(
          normalizeConfig({
            weekdayRate: 125,
            offSeasonRate: 125,
            partyDeckRatePerDay: 500,
            weekendRates: {
              singleDay: 125,
              twoConsecutiveDays: 350,
              threeDayCombo: 450,
            },
          })
        );
      }
    })();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setNumberOfHunters(parsed.numberOfHunters ?? 1);
        setSelectedDates(parsed.selectedDates ?? []);
        setPartyDeckDates(parsed.partyDeckDates ?? []);
        setMerchItems(parsed.merchItems ?? {});
        setBooking(parsed.booking ?? null);
      } catch (err) {
        console.error("Failed to parse cart from storage", err);
      }
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const payload = {
      numberOfHunters,
      selectedDates,
      partyDeckDates,
      merchItems,
      booking,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [
    numberOfHunters,
    selectedDates,
    partyDeckDates,
    merchItems,
    booking,
    isHydrated,
  ]);

  const addOrUpdateMerchItem = (product: Product, quantity: number) => {
    setMerchItems((prev) => {
      if (quantity === 0) {
        const updated = { ...prev };
        delete updated[product.id];
        return updated;
      }
      return {
        ...prev,
        [product.id]: { product, quantity },
      };
    });
  };

  const calculateBookingTotal = () => {
    const dates = booking?.dates || selectedDates;
    const hunters = booking?.numberOfHunters || numberOfHunters;
    const deckDates = booking?.partyDeckDates || partyDeckDates;

    if (!dates.length) return 0;

    const cfg = seasonCfg ?? normalizeConfig(); // safe defaults
    const {
      seasonStart,
      seasonEnd,
      weekdayRate,
      offSeasonRate,
      partyDeckPerDay,
      weekend,
    } = cfg;

    const dateObjs = dates
      .map((d) => {
        const [y, m, d2] = d.split("-").map(Number);
        const obj = new Date(y, m - 1, d2);
        obj.setHours(0, 0, 0, 0);
        return obj;
      })
      .sort((a, b) => a.getTime() - b.getTime());

    let perPersonTotal = 0;
    let i = 0;

    while (i < dateObjs.length) {
      const cur = dateObjs[i];
      const dow = cur.getDay();

      // Off-season day: flat per-day price
      if (!isInSeason(cur, { seasonStart, seasonEnd })) {
        perPersonTotal += offSeasonRate;
        i += 1;
        continue;
      }

      // 3-day Fri–Sat–Sun bundle
      if (dow === 5 && i + 2 < dateObjs.length) {
        const d1 = dateObjs[i + 1];
        const d2 = dateObjs[i + 2];
        const diff1 = (d1.getTime() - cur.getTime()) / 86_400_000;
        const diff2 = (d2.getTime() - d1.getTime()) / 86_400_000;
        if (
          diff1 === 1 &&
          diff2 === 1 &&
          d1.getDay() === 6 &&
          d2.getDay() === 0 &&
          isInSeason(d1, { seasonStart, seasonEnd }) &&
          isInSeason(d2, { seasonStart, seasonEnd })
        ) {
          perPersonTotal += weekend.threeDayCombo;
          i += 3;
          continue;
        }
      }

      // 2-day consecutive Fri–Sat or Sat–Sun
      if (i + 1 < dateObjs.length) {
        const next = dateObjs[i + 1];
        const diff = (next.getTime() - cur.getTime()) / 86_400_000;
        const dowNext = next.getDay();
        if (
          diff === 1 &&
          isInSeason(next, { seasonStart, seasonEnd }) &&
          ((dow === 5 && dowNext === 6) || (dow === 6 && dowNext === 0))
        ) {
          perPersonTotal += weekend.twoConsecutiveDays;
          i += 2;
          continue;
        }
      }

      // Single in-season day — weekend uses weekend.singleDay (e.g., 125)
      const isWeekend = dow === 5 || dow === 6 || dow === 0;
      perPersonTotal += isWeekend ? weekend.singleDay : weekdayRate;
      i += 1;
    }

    const partyDeckCost = (deckDates.length || 0) * partyDeckPerDay;
    return perPersonTotal * hunters + partyDeckCost;
  };

  const calculateCartTotal = () => {
    const bookingTotal = calculateBookingTotal();
    const merchTotal = Object.values(merchItems).reduce(
      (acc, item) => acc + item.product.price * item.quantity,
      0
    );
    return bookingTotal + merchTotal;
  };
  const total = useMemo(
    () => calculateCartTotal(),
    [numberOfHunters, selectedDates, partyDeckDates, merchItems, booking]
  );

  const level3Items: Level3Item[] = useMemo(() => {
    const items: Level3Item[] = [];
    const bookingTotal = calculateBookingTotal();
    const dates = booking?.dates ?? selectedDates;
    const hunters = booking?.numberOfHunters ?? numberOfHunters;
    if (bookingTotal > 0) {
      items.push({
        skuCode: "HUNT",
        name: "Dove Hunt Booking",
        description: `Dove Hunt — ${dates.length} day(s), ${hunters} hunter(s)`,
        quantity: 1,
        price: bookingTotal,
        unitOfMeasure: "Each",
      });
    }
    // Merch line items
    for (const entry of Object.values(merchItems)) {
      items.push({
        skuCode: entry.product.id,
        name: entry.product.name ?? "Merch Item",
        description: entry.product.name ?? "Merch Item",
        quantity: entry.quantity,
        price: entry.product.price,
        unitOfMeasure: "Each",
      });
    }
    return items;
  }, [
    merchItems,
    booking,
    selectedDates,
    numberOfHunters,
    partyDeckDates,
    calculateBookingTotal,
  ]);

  const cartAdapter = useMemo(
    () => ({
      // orderId can be injected/attached later if you decide to store it in localStorage
      booking,
      merchItems,
    }),
    [booking, merchItems]
  );

  const clearCart = () => resetCart();
  const resetCart = () => {
    setNumberOfHunters(1);
    setSelectedDates([]);
    setPartyDeckDates([]);
    setMerchItems({});
    setBooking(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const value = {
    numberOfHunters,
    selectedDates,
    partyDeckDates,
    merchItems,
    booking,
    calculateBookingTotal,
    cartTotal: calculateCartTotal,
    total,
    level3Items,
    cart: cartAdapter,
    setNumberOfHunters,
    setSelectedDates,
    setPartyDeckDates,
    addOrUpdateMerchItem,
    setBooking,
    resetCart,
    clearCart,
    isHydrated,
  };

  if (!isHydrated) {
    return <div className="text-white text-center py-20">Loading cart...</div>;
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};
