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
    setNumberOfHunters,
    setSelectedDates,
    setPartyDeckDates,
    addOrUpdateMerchItem,
    setBooking,
    resetCart,
    isHydrated,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};
