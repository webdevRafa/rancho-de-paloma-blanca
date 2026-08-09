// CartContext.tsx
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { Product } from "../types/MerchTypes";
import type { NewBooking, SeasonConfig } from "../types/Types";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import { calculateBookingPricing } from "../utils/huntPricing";

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
  const [seasonCfg, setSeasonCfg] = useState<SeasonConfig | null>(null);
  useEffect(() => {
    (async () => {
      try {
        setSeasonCfg(await getSeasonConfig());
      } catch {
        setSeasonCfg(null);
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

    if (!dates.length || !seasonCfg) return 0;

    return calculateBookingPricing({
      dates,
      hunters,
      partyDeckDates: deckDates,
      config: seasonCfg,
    }).bookingTotal;
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
