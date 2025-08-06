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

export interface Order {
  id?: string; // Optional when writing, required when reading
  userId: string;
  status: OrderStatus;
  total: number;
  createdAt?: Timestamp;

  // Optional booking info (only present if user booked a hunt)
  booking?: Omit<NewBooking, "createdAt">;

  // Optional merch info (only present if user bought merch)
  merchItems?: Record<string, MerchCartItem>;
}