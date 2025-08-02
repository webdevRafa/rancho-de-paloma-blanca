import { Timestamp, serverTimestamp } from "firebase/firestore";

export type BookingStatus = "pending" | "paid" | "cancelled";

export type PackageOption = "1-day" | "2-day" | "3-day";

// When creating a booking (write)
export interface NewBooking {
  userId: string;
  name: string;
  email: string;
  phone?: string;

  dates: string[]; // Format: ['2025-09-14', '2025-09-15']
  numberOfHunters: number;
  includesPartyDeck: boolean;
  selectedPackage: PackageOption;

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
  seasonStart: string; // Format: '2025-09-14'
  seasonEnd: string;   // Format: '2025-10-26'

  seasonRates: SeasonRates;
  offSeasonRate: number;
  partyDeckRatePerDay: number;
  maxHuntersPerDay: number;
}
