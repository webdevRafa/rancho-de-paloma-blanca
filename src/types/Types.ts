import { Timestamp, serverTimestamp } from "firebase/firestore";
import type { MerchCartItem } from "./MerchTypes";

export type BookingStatus = "pending" | "paid" | "cancelled";

// Removed PackageOption as package selection is no longer part of the UI.
// Pricing is now calculated dynamically based on the selected dates and
// whether they fall on weekend days during the season.

// When creating a booking (write)
export interface NewBooking {
  userId: string;
  name: string;
  email: string;
  phone?: string;

  /**
   * An array of ISO date strings (YYYY-MM-DD) representing the days
   * booked for this hunt.
   */
  dates: string[];
  /**
   * Number of hunters in this party. Used to calculate price and
   * update daily availability counts.
   */
  numberOfHunters: number;
  /**
   * List of dates for which the customer has reserved the party deck.
   * Each date must be one of the booked `dates`. The party deck can only
   * be booked once per day, so this list cannot contain duplicate dates.
   * The price calculation will add `partyDeckRatePerDay` for each date
   * included here.
   */
  partyDeckDates: string[];

  /**
   * Total price for this booking, calculated server-side from the
   * season configuration and selected dates.
   */
  price: number;
  status: BookingStatus;
  notes?: string;

  createdAt: ReturnType<typeof serverTimestamp>;
}

// When fetching a booking (read)
export interface Booking extends NewBooking {
  id: string;
  createdAt: Timestamp;
  confirmedAt?: Timestamp;
}

export interface Availability {
  id: string; // Date string: '2025-09-14'
  huntersBooked: number;
  partyDeckBooked: boolean;
}


export interface SeasonRates {
  singleDay: number;
  twoConsecutiveDays: number;
  threeDayCombo: number;
}

export interface SeasonConfig {
  seasonStart: string;
  seasonEnd: string;
  weekendRates: SeasonRates;
  weekdayRate: number;
  availableDates: string[];
  partyDeckRatePerDay: number;
  maxHuntersPerDay: number;
}

export interface PendingOrder {
  userId: string;
  booking?: Omit<NewBooking, "createdAt">;
  merchItems?: Record<string, MerchCartItem>;
  total: number;
  status: BookingStatus;
  createdAt?: any; // Can be Firebase Timestamp or FieldValue
}

export type OrderStatus = "pending" | "paid" | "cancelled";
export type OrderBooking = Omit<NewBooking, "createdAt"> & {
  price?: number; // subtotal for the booking portion
};

export interface Order {
  id?: string;
  userId: string;
  status: OrderStatus;
  total: number;
  currency?: "USD" | "CAD";   // default to "USD" if omitted
  createdAt?: Timestamp;

  // Optional booking info
  booking?: OrderBooking;

  // Optional merch
  merchItems?: Record<string, MerchCartItem>;

  // NEW: optional customer block (lets backend avoid name-splitting logic)
  customer?: OrderCustomer;

  // NEW: optional itemization (nice for Deluxe Level 3, not required)
  level3?: Level3Item[];

  // Where we store Deluxe refs after link creation
  deluxe?: {
    linkId?: string | null;
    paymentId?: string | null;
    paymentUrl?: string | null;
    createdAt?: any;
    updatedAt?: any;
    lastEvent?: any;
  };
}
export interface OrderCustomer {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}
export interface Level3Item {
  skuCode?: string;
  quantity: number;
  price: number;              // per-unit price
  description?: string;
  unitOfMeasure?: string;     // e.g. "Each"
  itemDiscountAmount?: number;
  itemDiscountRate?: number;
}