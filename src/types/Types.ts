import { Timestamp, serverTimestamp } from "firebase/firestore";

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
   * Whether the customer has reserved the party deck. Adds the
   * partyDeckRatePerDay to the cost for each selected day.
   */
  includesPartyDeck: boolean;

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
