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
  dates: string[];
  numberOfHunters: number;
  partyDeckDates: string[];
  price: number;
  status: BookingStatus;
  notes?: string;
  attendees?: Attendee[];
  createdAt: ReturnType<typeof serverTimestamp>;
}
// Add these to your shared types
export type Attendee = {
  fullName: string;       // "First Last"
  email?: string;         // optional if you decide to collect
  waiverSigned?: boolean; // default false; admin can toggle later
};
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
export interface PaymentLinkMeta {
  provider: "Deluxe";
  paymentLinkId?: string;  // from Deluxe response
  paymentUrl?: string;     // from Deluxe response
  createdAt?: Date;        // or firestore Timestamp
  expiry?: string;         // e.g., "9 DAYS" or resolved date if you compute it
}

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
  booking?: Omit<NewBooking, "createdAt">;

  // Optional merch
  merchItems?: Record<string, MerchCartItem>;

  // NEW: optional customer block (lets backend avoid name-splitting logic)
  customer?: OrderCustomer;

  // NEW: optional itemization (nice for Deluxe Level 3, not required)
  level3?: Level3Item[];
  paymentLink?: PaymentLinkMeta;
  
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
export interface BillingAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: "US" | "CA" | string;
}



export interface OrderCustomer {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  billingAddress?: BillingAddress;
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

// --- Deluxe Payment Links: Request/Response ---

export type DppCurrency = "USD" | "CAD";

export interface DppAmount {
  amount: number;       // whole currency units (e.g., 200 = $200.00)
  currency: DppCurrency;
}

export interface DppOrderData {
  orderId: string;
}

export interface DppLevel3Item {
  skuCode: string;             // map from Product.skuCode
  quantity: number;            // integer
  price: number;               // per-item price (units, not cents)
  description?: string;        // product name or line description
  unitOfMeasure?: string;      // e.g., "Each", "Dozen"
  itemDiscountAmount?: number; // absolute discount on item line
  itemDiscountRate?: number;   // fraction (e.g., 0.1 for 10%)
}

export interface DppCustomDataItem {
  name: string;
  value: string;
}

export type DppDeliveryMethod = "ReturnOnly"; // extend later if using email delivery etc.

export interface DppPaymentLinkRequest {
  amount: DppAmount;
  firstName: string;
  lastName: string;
  orderData: DppOrderData;
  paymentLinkExpiry: string;              // e.g., "9 DAYS"
  acceptPaymentMethod: Array<"Card">;     // can extend if you enable more methods
  deliveryMethod: DppDeliveryMethod;

  // Optional fields you may include
  level3?: DppLevel3Item[];
  customData?: DppCustomDataItem[];
  acceptBillingAddress?: boolean;
  requiredBillingAddress?: boolean;
  acceptPhone?: boolean;
  requiredPhone?: boolean;
  confirmationMessage?: string;
}

// Deluxe success response for /paymentlinks
export interface DppPaymentLinkResponse {
  paymentLinkId: string;
  paymentUrl: string;
}

// Common error shape you can narrow later if their docs specify
export interface DppErrorResponse {
  error?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}


// Cloud Function contract types
export interface CreateDeluxePaymentRequest {
  orderId: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CreateDeluxePaymentResponse {
  provider: "Deluxe";
  paymentUrl: string;
  paymentLinkId?: string; // if you choose to also return it
}

export interface DeluxeWebhookEvent<T = unknown> {
  id?: string;
  type?: string;          // e.g., "Transaction"
  createdAt?: string;     // ISO if present
  data?: T;               // raw payload from Deluxe
  // you can refine T once you pin down their schemas
}