// CartContext.tsx
import { createContext, useContext, useState, useEffect } from "react";
import type { Product } from "../types/MerchTypes";
import type { NewBooking } from "../types/Types";

type MerchCartItem = {
  product: Product;
  quantity: number;
};

interface CartContextType {
  numberOfHunters: number;
  selectedDates: string[];
  partyDeckDates: string[];
  merchItems: Record<string, MerchCartItem>;
  booking: Omit<NewBooking, "createdAt"> | null;
  calculateBookingTotal: () => number;
  cartTotal: () => number;
  setNumberOfHunters: (n: number) => void;
  setSelectedDates: (d: string[]) => void;
  setPartyDeckDates: (d: string[]) => void;
  addOrUpdateMerchItem: (product: Product, quantity: number) => void;
  setBooking: (b: Omit<NewBooking, "createdAt">) => void;
  resetCart: () => void;
  isHydrated: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_KEY = "rdp_cart";

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

    const weekdayRate = 125;
    const baseWeekendRates = {
      singleDay: 200,
      twoConsecutiveDays: 350,
      threeDayCombo: 450,
    };
    const dateObjs = dates
      .map((d) => {
        const [y, m, d2] = d.split("-").map(Number);
        return new Date(y, m - 1, d2);
      })
      .sort((a, b) => a.getTime() - b.getTime());

    let perPersonTotal = 0;
    let i = 0;
    while (i < dateObjs.length) {
      const current = dateObjs[i];
      const dow = current.getDay();
      if (dow === 5 && i + 2 < dateObjs.length) {
        const d1 = dateObjs[i + 1];
        const d2 = dateObjs[i + 2];
        const diff1 = (d1.getTime() - current.getTime()) / 86400000;
        const diff2 = (d2.getTime() - d1.getTime()) / 86400000;
        if (
          diff1 === 1 &&
          diff2 === 1 &&
          d1.getDay() === 6 &&
          d2.getDay() === 0
        ) {
          perPersonTotal += baseWeekendRates.threeDayCombo;
          i += 3;
          continue;
        }
      }
      if (
        i + 1 < dateObjs.length &&
        ((dow === 5 && dateObjs[i + 1].getDay() === 6) ||
          (dow === 6 && dateObjs[i + 1].getDay() === 0))
      ) {
        const next = dateObjs[i + 1];
        const diff = (next.getTime() - current.getTime()) / 86400000;
        if (diff === 1) {
          perPersonTotal += baseWeekendRates.twoConsecutiveDays;
          i += 2;
          continue;
        }
      }
      if ([5, 6, 0].includes(dow)) {
        perPersonTotal += baseWeekendRates.singleDay;
      } else {
        perPersonTotal += weekdayRate;
      }
      i++;
    }
    const partyDeckCost = deckDates.length * 500;
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
    setNumberOfHunters,
    setSelectedDates,
    setPartyDeckDates,
    addOrUpdateMerchItem,
    setBooking,
    resetCart,
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
