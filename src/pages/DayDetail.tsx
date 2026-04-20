// src/pages/DayDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import CountUp from "react-countup";
import { toast } from "react-toastify";
import { db } from "../firebase/firebaseConfig";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import type { PricingWindow, SeasonConfig } from "../types/Types";

/* ---------- Types ---------- */

type AvailabilityDoc = {
  id: string; // "YYYY-MM-DD"
  huntersBooked: number;
  partyDeckBooked: boolean;
  isOffSeason?: boolean;
  timestamp?: any;
};

type Attendee = {
  fullName: string;
  email?: string;
  waiverSigned?: boolean;
};

type LineItem = {
  description: string;
  price: number;
  quantity: number;
  skuCode?: string;
};

type Booking = {
  dates: string[];
  numberOfHunters?: number;
  partyDeckDates?: string[];
  lineItems?: LineItem[];

  attendees?: Array<
    | {
        name?: string;
        fullName?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        waiverSigned?: boolean;
        waiverIsSigned?: boolean;
      }
    | string
  >;
  partyMembers?: Array<{ name?: string } | string>;
  guestNames?: string[];
  hunterNames?: string[];
};

type OrderDoc = {
  id: string;
  userId?: string;
  status?: "pending" | "paid" | "canceled" | "cancelled" | "refunded";
  createdAt?: any;
  total?: number;
  customer?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  booking?: Booking;
  merchItems?: Record<
    string,
    { name?: string; quantity?: number; price?: number; sku?: string }
  >;
};

/* ---------- Helpers ---------- */

function friendlyDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(dt);
}

function formatLongDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(dt);
}

function formatHeaderDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(dt);
}

function formatCreatedAt(value: any) {
  if (!value) return "—";

  let dt: Date | null = null;

  if (value?.toDate && typeof value.toDate === "function") {
    dt = value.toDate();
  } else if (value instanceof Date) {
    dt = value;
  } else if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) dt = parsed;
  } else if (typeof value === "object" && typeof value.seconds === "number") {
    dt = new Date(value.seconds * 1000);
  }

  if (!dt || Number.isNaN(dt.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(dt);
}

function currency(n = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function shortOrderId(id: string) {
  if (!id) return "—";
  return id.length <= 14 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function formatPhone(phone?: string) {
  const raw = String(phone ?? "").replace(/\D/g, "");
  if (!raw) return "—";

  if (raw.length === 11 && raw.startsWith("1")) {
    const p = raw.slice(1);
    return `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
  }

  if (raw.length === 10) {
    return `(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6)}`;
  }

  return phone ?? "—";
}

function getCustomerName(order: OrderDoc) {
  return (
    `${order.customer?.firstName ?? ""} ${
      order.customer?.lastName ?? ""
    }`.trim() || "Customer"
  );
}

function parseIsoDateLocal(iso?: string) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addDaysLocal(iso: string, days: number) {
  const base = parseIsoDateLocal(iso);
  if (!base) return iso;
  base.setDate(base.getDate() + days);
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function areConsecutiveIsoDates(a: string, b: string) {
  return addDaysLocal(a, 1) === b;
}

function getHuntersForOrder(order: OrderDoc) {
  const explicit = order.booking?.numberOfHunters;
  if (typeof explicit === "number" && explicit > 0) return explicit;

  const attendeesCount = order.booking?.attendees?.length ?? 0;
  return attendeesCount;
}

function getPricingWindowForDate(
  iso: string,
  seasonConfig: SeasonConfig
): PricingWindow | null {
  const windows = seasonConfig.pricingWindows ?? [];
  return windows.find((w) => iso >= w.start && iso <= w.end) ?? null;
}

function getPricingWindowKey(window: PricingWindow | null) {
  if (!window) return "none";
  return [
    window.start,
    window.end,
    window.type,
    window.rate ?? "",
    window.singleDay ?? "",
    window.twoConsecutiveDays ?? "",
    window.threeDayCombo ?? "",
    window.label ?? "",
  ].join("|");
}

function getFallbackSingleDayRate(
  iso: string,
  seasonConfig: SeasonConfig
): number {
  const date = parseIsoDateLocal(iso);
  const day = date?.getDay();

  if (day === 5 || day === 6 || day === 0) {
    return (
      seasonConfig.weekendRates?.singleDay ?? seasonConfig.weekdayRate ?? 0
    );
  }

  return seasonConfig.weekdayRate ?? 0;
}

function buildPerHunterDailyRateMap(
  bookingDates: string[],
  seasonConfig: SeasonConfig
) {
  const sorted = [...bookingDates].sort();
  const rateMap: Record<string, number> = {};

  if (!sorted.length) return rateMap;

  type DateGroup = {
    dates: string[];
    window: PricingWindow | null;
  };

  const groups: DateGroup[] = [];
  let currentDates: string[] = [];
  let currentWindow: PricingWindow | null = null;

  for (const iso of sorted) {
    const nextWindow = getPricingWindowForDate(iso, seasonConfig);

    if (!currentDates.length) {
      currentDates = [iso];
      currentWindow = nextWindow;
      continue;
    }

    const prevIso = currentDates[currentDates.length - 1];
    const sameWindow =
      getPricingWindowKey(currentWindow) === getPricingWindowKey(nextWindow);

    if (sameWindow && areConsecutiveIsoDates(prevIso, iso)) {
      currentDates.push(iso);
    } else {
      groups.push({ dates: currentDates, window: currentWindow });
      currentDates = [iso];
      currentWindow = nextWindow;
    }
  }

  if (currentDates.length) {
    groups.push({ dates: currentDates, window: currentWindow });
  }

  for (const group of groups) {
    const window = group.window;

    if (!window || window.type === "flat") {
      for (const iso of group.dates) {
        rateMap[iso] =
          window?.rate ?? getFallbackSingleDayRate(iso, seasonConfig);
      }
      continue;
    }

    let i = 0;
    while (i < group.dates.length) {
      const remaining = group.dates.length - i;

      if (remaining >= 3 && typeof window.threeDayCombo === "number") {
        const perDay = window.threeDayCombo / 3;
        rateMap[group.dates[i]] = perDay;
        rateMap[group.dates[i + 1]] = perDay;
        rateMap[group.dates[i + 2]] = perDay;
        i += 3;
        continue;
      }

      if (remaining >= 2 && typeof window.twoConsecutiveDays === "number") {
        const perDay = window.twoConsecutiveDays / 2;
        rateMap[group.dates[i]] = perDay;
        rateMap[group.dates[i + 1]] = perDay;
        i += 2;
        continue;
      }

      const singleDayRate =
        window.singleDay ??
        window.rate ??
        getFallbackSingleDayRate(group.dates[i], seasonConfig);

      rateMap[group.dates[i]] = singleDayRate;
      i += 1;
    }
  }

  return rateMap;
}

function computeBookingRevenueForDay(
  order: OrderDoc,
  dayIso: string,
  seasonConfig: SeasonConfig
) {
  const bookingDates = order.booking?.dates ?? [];
  if (!bookingDates.includes(dayIso)) return 0;

  const hunters = getHuntersForOrder(order);
  if (!hunters) return 0;

  const perHunterRateMap = buildPerHunterDailyRateMap(
    bookingDates,
    seasonConfig
  );

  let subtotal = (perHunterRateMap[dayIso] ?? 0) * hunters;

  const hasPartyDeckThatDay = (order.booking?.partyDeckDates ?? []).includes(
    dayIso
  );

  if (hasPartyDeckThatDay) {
    subtotal += seasonConfig.partyDeckRatePerDay ?? 0;
  }

  return subtotal;
}

function normalizeStatus(status?: string) {
  const s = String(status ?? "paid").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "canceled") return "cancelled";
  if (s === "pending") return "pending";
  if (s === "refunded") return "refunded";
  return "paid";
}

function getStatusClasses(status?: string) {
  const normalized = normalizeStatus(status);
  if (normalized === "paid") {
    return "border-emerald-400/20 bg-emerald-400/15 text-emerald-200";
  }
  if (normalized === "pending") {
    return "border-amber-400/20 bg-amber-400/15 text-amber-200";
  }
  if (normalized === "refunded") {
    return "border-sky-400/20 bg-sky-400/15 text-sky-200";
  }
  return "border-rose-400/20 bg-rose-400/15 text-rose-200";
}

function getWaiverCounts(order: OrderDoc) {
  const attendees = toAttendeeObjects(order) ?? [];
  return {
    signed: attendees.filter((a) => !!a.waiverSigned).length,
    total: attendees.length,
  };
}

// Normalize attendees[] into {fullName,email,waiverSigned}
function toAttendeeObjects(order: OrderDoc): Attendee[] | null {
  const arr = (order.booking as any)?.attendees;
  if (Array.isArray(arr) && arr.length) {
    return arr
      .map((a: any) => ({
        fullName: String(
          a?.fullName ??
            a?.name ??
            `${[a?.firstName, a?.lastName].filter(Boolean).join(" ")}` ??
            ""
        ).trim(),
        email: a?.email || undefined,
        waiverSigned: !!a?.waiverSigned || !!a?.waiverIsSigned,
      }))
      .filter((a) => a.fullName);
  }
  return null;
}

async function initializeAttendees(order: OrderDoc, names: string[]) {
  const attendees: Attendee[] = names.map((n) => ({
    fullName: n,
    waiverSigned: false,
  }));
  await updateDoc(doc(db, "orders", order.id), {
    "booking.attendees": attendees,
  });
  toast.success("Attendees initialized for waiver tracking.");
}

async function toggleWaiver(orderId: string, index: number, next: boolean) {
  const ref = doc(db, "orders", orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as any;
  const attendees: Attendee[] = Array.isArray(data?.booking?.attendees)
    ? data.booking.attendees
    : [];
  if (!attendees[index]) return;

  const updated = attendees.map((a: Attendee, i: number) =>
    i === index ? { ...a, waiverSigned: next } : a
  );

  await updateDoc(ref, { "booking.attendees": updated });
}

// Pull best-effort party names from whatever the booking has
function extractPartyNames(order: OrderDoc): string[] {
  const names: string[] = [];
  const b = order.booking;
  if (!b) return names;

  const push = (v?: string) => {
    const s = (v ?? "").trim();
    if (s) names.push(s);
  };

  const addFromUnknownArray = (arr: any[]) => {
    for (const itm of arr) {
      if (!itm) continue;
      if (typeof itm === "string") {
        push(itm);
      } else if (typeof itm === "object") {
        const n =
          itm.fullName ??
          itm.name ??
          [itm.firstName, itm.lastName].filter(Boolean).join(" ") ??
          itm.email;
        push(n);
      }
    }
  };

  if (Array.isArray((b as any).attendees))
    addFromUnknownArray((b as any).attendees);
  if (Array.isArray((b as any).partyMembers))
    addFromUnknownArray((b as any).partyMembers);
  if (Array.isArray((b as any).guestNames))
    addFromUnknownArray((b as any).guestNames);
  if (Array.isArray((b as any).hunterNames))
    addFromUnknownArray((b as any).hunterNames);

  const customerName = getCustomerName(order);
  if (
    customerName &&
    !names.some((n) => n.toLowerCase() === customerName.toLowerCase())
  ) {
    names.unshift(customerName);
  }

  const partySize = b?.numberOfHunters ?? names.length;
  while (names.length < partySize) names.push(`Guest ${names.length + 1}`);

  const seen = new Set<string>();
  return names.filter((n) => {
    const key = n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ---------- Modal ---------- */

function OrderDetailsModal({
  order,
  dayId,
  resolvedPhone,
  onClose,
}: {
  order: OrderDoc;
  dayId: string;
  resolvedPhone?: string;
  onClose: () => void;
}) {
  const names = extractPartyNames(order);
  const structured = toAttendeeObjects(order) ?? [];
  const [rows, setRows] = useState<Attendee[]>(structured);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  useEffect(() => {
    setRows(structured);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, structured.length, JSON.stringify(structured)]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const deckAny = (order.booking?.partyDeckDates ?? []).length > 0;
  const deckToday = (order.booking?.partyDeckDates ?? []).includes(dayId);
  const waiver = getWaiverCounts(order);

  const customerName =
    `${order.customer?.firstName ?? ""} ${
      order.customer?.lastName ?? ""
    }`.trim() || "Customer";

  const createdLabel = formatCreatedAt(order.createdAt);
  const displayPhone = formatPhone(resolvedPhone || order.customer?.phone);
  const bookedDates = (order.booking?.dates ?? []).map(friendlyDay);
  const hunterCount = order.booking?.numberOfHunters ?? rows.length ?? 0;
  const normalizedStatus = normalizeStatus(order.status);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 md:p-8">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-[3px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-[#16100c] text-white shadow-[0_35px_90px_rgba(0,0,0,0.5)]">
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#16100c]/95 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4 px-5 py-5 md:px-6">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.26em] text-white/45">
                Booking record
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="font-acumin tracking-tight text-white text-3xl">
                  Order Details
                </h2>

                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getStatusClasses(
                    normalizedStatus
                  )}`}
                >
                  {normalizedStatus}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono">
                  {order.id}
                </span>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(order.id);
                    toast.info("Order ID copied.");
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 transition hover:bg-white/10"
                >
                  Copy ID
                </button>

                {order.customer?.email && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        order.customer?.email ?? ""
                      );
                      toast.info("Email copied.");
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 transition hover:bg-white/10"
                  >
                    Copy Email
                  </button>
                )}

                {order.customer?.phone && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        order.customer?.phone ?? ""
                      );
                      toast.info("Phone copied.");
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 transition hover:bg-white/10"
                  >
                    Copy Phone
                  </button>
                )}
              </div>

              <div className="mt-3 text-[13px] text-white/52">
                Created <span className="mx-1 text-white/28">•</span>
                <span className="text-white/74">{createdLabel}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/85 transition hover:bg-white/10 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        <div className="order-details-scroll max-h-[78vh] overflow-y-auto">
          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4 md:gap-4 md:p-6">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                Customer
              </div>
              <div className="mt-3  font-semibold leading-[1.15] text-white text-lg">
                {customerName}
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-white/72">
                <div>{order.customer?.email || "—"}</div>
                <div>{displayPhone}</div>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                Total
              </div>
              <div className="mt-3  font-semibold leading-none tracking-tight text-white text-lg">
                {currency(order.total ?? 0)}
              </div>
              <div className="mt-4">
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getStatusClasses(
                    normalizedStatus
                  )}`}
                >
                  {normalizedStatus}
                </span>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                Booked Dates
              </div>

              {bookedDates.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                  <div className="order-details-scroll max-h-[188px] overflow-y-auto pr-1">
                    <div className="divide-y divide-white/10">
                      {bookedDates.map((dateLabel, idx) => (
                        <div
                          key={`${order.id}-booked-date-${idx}`}
                          className="flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.025]"
                        >
                          <span className="text-sm text-white/60">
                            Day {idx + 1}
                          </span>
                          <span className="text-base font-semibold text-white">
                            {dateLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-[1.1rem] font-medium text-white/70">
                  —
                </div>
              )}

              <div className="mt-3 flex items-center justify-between text-sm text-white/60">
                <span>Total booked</span>
                <span className="font-medium text-white/80">
                  {(order.booking?.dates ?? []).length} day
                  {(order.booking?.dates ?? []).length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                Party / Waivers
              </div>

              <div className="mt-3 text-[1.55rem] font-semibold leading-[1.15] text-white">
                {hunterCount} hunter{hunterCount === 1 ? "" : "s"}
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                <div className="divide-y divide-white/10 text-sm">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-white/60">Party Deck</span>
                    <span className="font-medium text-white">
                      {deckAny ? (deckToday ? "Yes (today)" : "Yes") : "No"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-white/60">Waivers signed</span>
                    <span className="font-medium text-white">
                      {waiver.signed}/{waiver.total}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 px-5 py-5 md:px-6 md:py-6">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="mt-1 text-lg font-acumin leading-none text-white">
                  Attendees & Waivers
                </h3>
                <p className="mt-2 text-sm text-white/52">
                  Track signature status for each hunter on this booking.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                    waiver.total === 0
                      ? "border-white/10 bg-white/5 text-white/60"
                      : waiver.signed === waiver.total
                      ? "border-emerald-400/20 bg-emerald-400/15 text-emerald-200"
                      : "border-amber-400/20 bg-amber-400/15 text-amber-200"
                  }`}
                >
                  {waiver.total === 0
                    ? "Not started"
                    : waiver.signed === waiver.total
                    ? "All signed"
                    : `${waiver.total - waiver.signed} remaining`}
                </span>

                {rows.length === 0 && names.length > 0 && (
                  <button
                    onClick={() => initializeAttendees(order, names)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10"
                  >
                    Initialize for waivers
                  </button>
                )}
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                No structured attendee records yet. Click{" "}
                <span className="font-semibold text-white/80">
                  Initialize for waivers
                </span>{" "}
                to create them from the party list.
              </div>
            ) : (
              <div className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.025] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="order-details-scroll max-h-[380px] overflow-auto pr-1">
                  <table className="w-full min-w-[760px] text-sm text-white">
                    <thead className="sticky top-0 z-[1] bg-[#1a120d]/95 backdrop-blur-xl">
                      <tr className="border-b border-white/10 text-left text-white/58">
                        <th className="w-12 px-5 py-3.5">#</th>
                        <th className="px-5 py-3.5">Name</th>

                        <th className="w-48 px-5 py-3.5">Waiver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a, idx) => (
                        <tr
                          key={`${order.id}-att-${idx}`}
                          className="border-b border-white/5 transition hover:bg-white/[0.025]"
                        >
                          <td className="px-5 py-4 text-white/65">{idx + 1}</td>

                          <td className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-white">
                                {a.fullName}
                              </span>

                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  a.waiverSigned
                                    ? "bg-emerald-400/15 text-emerald-200"
                                    : "bg-white/10 text-white/65"
                                }`}
                              >
                                {a.waiverSigned ? "Signed" : "Pending"}
                              </span>

                              {idx === 0 && (
                                <span className="inline-flex items-center rounded-full border border-[var(--color-accent-gold)]/20 bg-[var(--color-accent-gold)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent-gold)]">
                                  Lead
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <label className="inline-flex items-center gap-2.5 text-white/85">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-white/20 bg-transparent accent-[var(--color-accent-gold)]"
                                disabled={savingIdx === idx}
                                checked={!!a.waiverSigned}
                                onChange={async (e) => {
                                  const next = e.currentTarget.checked;
                                  try {
                                    setSavingIdx(idx);
                                    setRows((prev) =>
                                      prev.map((r, i) =>
                                        i === idx
                                          ? { ...r, waiverSigned: next }
                                          : r
                                      )
                                    );
                                    await toggleWaiver(order.id, idx, next);
                                    toast[next ? "success" : "info"](
                                      next
                                        ? `Waiver marked signed for ${a.fullName}.`
                                        : `Waiver marked NOT signed for ${a.fullName}.`
                                    );
                                  } catch (err) {
                                    setRows((prev) =>
                                      prev.map((r, i) =>
                                        i === idx
                                          ? { ...r, waiverSigned: !next }
                                          : r
                                      )
                                    );
                                    toast.error(
                                      "Could not update waiver. Try again."
                                    );
                                  } finally {
                                    setSavingIdx(null);
                                  }
                                }}
                              />
                              <span className="text-sm text-white/84">
                                {a.waiverSigned ? "Signed" : "Mark signed"}
                              </span>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayReportPreviewModal({
  dayId,
  orders,
  phoneMap,
  seasonConfig,
  onClose,
}: {
  dayId: string;
  orders: OrderDoc[];
  phoneMap: Record<string, string>;
  seasonConfig: SeasonConfig | null;
  onClose: () => void;
}) {
  const generatedAt = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reportRows = useMemo(() => {
    return [...orders]
      .filter((order) => normalizeStatus(order.status) === "paid")
      .sort((a, b) => {
        const aTime =
          typeof a.createdAt?.seconds === "number"
            ? a.createdAt.seconds
            : a.createdAt?.toDate?.()?.getTime?.() ?? 0;
        const bTime =
          typeof b.createdAt?.seconds === "number"
            ? b.createdAt.seconds
            : b.createdAt?.toDate?.()?.getTime?.() ?? 0;
        return bTime - aTime;
      })
      .map((order) => {
        const hunters = getHuntersForOrder(order);
        const waiver = getWaiverCounts(order);
        const resolvedPhone = phoneMap[order.id] || order.customer?.phone || "";
        const bookedDates =
          order.booking?.dates?.map((d) => friendlyDay(d)).join(", ") || "—";

        return {
          id: order.id,
          shortId: shortOrderId(order.id),
          customerName: getCustomerName(order),
          email: order.customer?.email || "—",
          phone: formatPhone(resolvedPhone),
          hunters,
          bookedDates,
          waiverLabel: waiver.total ? `${waiver.signed}/${waiver.total}` : "—",
          dayRevenue: seasonConfig
            ? computeBookingRevenueForDay(order, dayId, seasonConfig)
            : 0,
        };
      });
  }, [orders, phoneMap, dayId, seasonConfig]);

  const totalHunters = reportRows.reduce((sum, row) => sum + row.hunters, 0);
  const reportRevenue = reportRows.reduce(
    (sum, row) => sum + row.dayRevenue,
    0
  );

  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const handlePrintReport = () => {
    const printWindow = window.open("", "_blank", "width=1100,height=900");

    if (!printWindow) {
      alert("Unable to open print preview. Please allow popups and try again.");
      return;
    }

    const rowsHtml = reportRows
      .map((row) => {
        return `
          <tr>
            <td class="mono">${escapeHtml(row.shortId)}</td>
            <td>
              <div class="customer-name">${escapeHtml(row.customerName)}</div>
              <div class="customer-email">${escapeHtml(row.email)}</div>
            </td>
            <td>${escapeHtml(row.phone || "—")}</td>
            <td>${row.hunters}</td>
            <td>${escapeHtml(row.waiverLabel)}</td>
            <td>${escapeHtml(row.bookedDates)}</td>
            <td class="revenue">${escapeHtml(currency(row.dayRevenue))}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Booking Day Report - ${escapeHtml(
            formatLongDate(dayId)
          )}</title>
          <style>
            @page {
              size: auto;
              margin: 0.4in;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #111111;
              font-family: Arial, Helvetica, sans-serif;
            }
            
            body {
              padding: 0;
            }

            .page {
              width: 100%;
              max-width: 960px;
              margin: 0 auto;
              padding: 24px 28px 32px;
            }

            .summary-card,
            .orders-card {
            
              border-radius: 10px;
              background: #ffffff;
            }

            .summary-card {
              padding: 12px;
            }

            .brand {
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.1em;
              color: #8a6a1f;
            }
            
            .title {
              margin: 4px 0 0;
              font-size: 17px;
              line-height: 1.15;
              color: #111111;
            }
            
            .date {
              margin-top: 4px;
              font-size: 10.5px;
              line-height: 1.25;
              color: #2f2f2f;
            }
            
            .generated {
              margin-top: 6px;
              font-size: 9.5px;
              line-height: 1.2;
              color: #5f5f5f;
            }

            .metrics {
              margin-top: 10px;
              width: 100%;
              border-collapse: separate;
              border-spacing: 8px 0;
              table-layout: fixed;
            }

            .metrics td {
              width: 25%;
              border: 1px solid #dddddd;
              border-radius: 8px;
              padding: 7px 10px 8px;
              vertical-align: top;
            }
            
            .metric-label {
              font-size: 7.5px;
              font-weight: 700;
              letter-spacing: 0.1em;
              text-transform: uppercase;
              color: #666666;
            }
            
            .metric-value {
              margin-top: 3px;
              font-size: 12px;
              line-height: 1.1;
              font-weight: 700;
              color: #111111;
            }

            .orders-card {
              margin-top: 10px;
              overflow: hidden;
            }

            .orders-header {
              padding: 12px 14px 8px;
              border-bottom: 1px solid #e5e5e5;
            }
            .summary-card {
              margin-bottom: 10px;
            }
            .orders-title {
              margin: 0;
              font-size: 11.5px;
              line-height: 1.2;
              font-weight: 700;
              color: #111111;
            }
            
            .orders-note {
              margin: 3px 0 0;
              font-size: 9px;
              line-height: 1.3;
              color: #666666;
            }

            table.report-table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            
            .report-table thead {
              display: table-header-group;
            }
            
            .report-table th,
            .report-table td {
              padding: 6px 7px;
              border-bottom: 1px solid #e7e7e7;
              text-align: left;
              vertical-align: top;
              font-size: 10px;
              line-height: 1.28;
            }
            
            .report-table th {
              font-size: 8px;
              font-weight: 700;
              letter-spacing: 0.04em;
              text-transform: uppercase;
              color: #5f5f5f;
              white-space: nowrap;
            }
            
            .report-table td {
              overflow-wrap: break-word;
              word-break: normal;
            }
            
            .report-table td:nth-child(1),
            .report-table td:nth-child(3),
            .report-table td:nth-child(4),
            .report-table td:nth-child(5),
            .report-table td:nth-child(7) {
              white-space: nowrap;
            }
            
            .report-table td:nth-child(2),
            .report-table td:nth-child(6) {
              white-space: normal;
            }

            .report-table tr {
              page-break-inside: avoid;
              break-inside: avoid;
            }
        
            .report-table tbody tr {
              height: 32px;
            }

            .report-table th:last-child,
            .report-table td:last-child {
              text-align: right;
              padding-right: 10px;
            }

            .mono {
              font-family: "Courier New", Courier, monospace;
              font-size: 8.8px;
              line-height: 1.2;
              color: #222222;
            }
            
            .customer-name {
              color: #111111;
              font-size: 9.8px;
              line-height: 1.2;
            }
            
            .customer-email {
              margin-top: 1px;
              font-size: 8.2px;
              line-height: 1.15;
              color: #777777;
            }

            .revenue {
              font-weight: 700;
              white-space: nowrap;
              text-align: right;
              letter-spacing: 0.01em;
            }
          

            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              .page {
                page-break-after: auto;
              }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="summary-card">
              <div class="brand">Rancho de Paloma Blanca</div>
              <h1 class="title">Booking Day Report</h1>
              <div class="date">${escapeHtml(formatLongDate(dayId))}</div>
              <div class="generated">Generated ${escapeHtml(generatedAt)}</div>

              <table class="metrics" aria-hidden="true">
                <tr>
                  <td>
                    <div class="metric-label">Orders</div>
                    <div class="metric-value">${reportRows.length}</div>
                  </td>
                  <td>
                    <div class="metric-label">Paid Orders</div>
                    <div class="metric-value">${reportRows.length}</div>
                  </td>
                  <td>
                    <div class="metric-label">Hunters</div>
                    <div class="metric-value">${totalHunters}</div>
                  </td>
                  <td>
                    <div class="metric-label">Day Revenue</div>
                    <div class="metric-value">${escapeHtml(
                      currency(reportRevenue)
                    )}</div>
                  </td>
                </tr>
              </table>
            </div>

            <div class="orders-card">
              <div class="orders-header">
                <h2 class="orders-title">Paid orders this day</h2>
                <p class="orders-note">
                  Paid orders only. Revenue is calculated for this specific date.
                </p>
              </div>

              <table class="report-table">
              <colgroup>
                <col style="width: 12%">
                <col style="width: 25%">
                <col style="width: 14%">
                <col style="width: 9%">
                <col style="width: 10%">
                <col style="width: 18%">
                <col style="width: 12%">
              </colgroup>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Hunters</th>
                  <th>Waivers</th>
                  <th>Dates</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <>
      <div className="day-report-print-root fixed inset-0 z-[85] flex items-center justify-center p-4 md:p-8">
        <div
          className="day-report-backdrop absolute inset-0 bg-black/80 backdrop-blur-[4px]"
          onClick={onClose}
        />

        <div className="day-report-shell relative z-10 w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-[#16100c] text-white shadow-[0_35px_90px_rgba(0,0,0,0.55)]">
          <div className="day-report-screen-heading sticky top-0 z-10 border-b border-white/10 bg-[#16100c]/95 backdrop-blur-xl">
            <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-start md:justify-between md:px-6">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.26em] text-white/45">
                  Report preview
                </div>
                <h2 className="mt-2 text-3xl font-acumin tracking-tight text-white">
                  Day Booking Report
                </h2>
                <div className="mt-2 text-sm text-white/55">
                  Review all paid orders associated with{" "}
                  <span className="text-white/80">{formatLongDate(dayId)}</span>
                  .
                </div>
              </div>

              <div className="day-report-actions flex flex-wrap items-center gap-2">
                <button
                  onClick={handlePrintReport}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/85 transition hover:bg-white/10 hover:text-white"
                >
                  Print
                </button>

                <button
                  onClick={onClose}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/85 transition hover:bg-white/10 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>

          <div className="day-report-scroll max-h-[82vh] overflow-y-auto">
            <div className="day-report-inner mx-auto max-w-[1060px] p-4 md:p-5">
              <div className="day-report-summary rounded-[22px] border border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="day-report-brand text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-gold)]">
                      Rancho de Paloma Blanca
                    </div>
                    <h3 className="day-report-title mt-2 text-[2rem] font-acumin tracking-tight text-white">
                      Booking Day Report
                    </h3>
                    <div className="day-report-date mt-1 text-sm text-white/72">
                      {formatLongDate(dayId)}
                    </div>
                  </div>

                  <div className="day-report-generated rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/65">
                    Generated {generatedAt}
                  </div>
                </div>

                <div className="day-report-metrics mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="day-report-metric rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="day-report-metric-label text-[10px] uppercase tracking-[0.18em] text-white/45">
                      Orders
                    </div>
                    <div className="day-report-metric-value mt-1 text-xl font-semibold text-white">
                      {reportRows.length}
                    </div>
                  </div>

                  <div className="day-report-metric rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="day-report-metric-label text-[10px] uppercase tracking-[0.18em] text-white/45">
                      Paid orders
                    </div>
                    <div className="day-report-metric-value mt-1 text-xl font-semibold text-white">
                      {reportRows.length}
                    </div>
                  </div>

                  <div className="day-report-metric rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="day-report-metric-label text-[10px] uppercase tracking-[0.18em] text-white/45">
                      Hunters
                    </div>
                    <div className="day-report-metric-value mt-1 text-xl font-semibold text-white">
                      {totalHunters}
                    </div>
                  </div>

                  <div className="day-report-metric rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="day-report-metric-label text-[10px] uppercase tracking-[0.18em] text-white/45">
                      Day revenue
                    </div>
                    <div className="day-report-metric-value mt-1 text-xl font-semibold text-white">
                      {currency(reportRevenue)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="day-report-orders mt-3 overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.03]">
                <div className="day-report-orders-header border-b border-white/10 px-4 py-3">
                  <h4 className="day-report-section-title text-lg font-acumin text-white">
                    Orders included
                  </h4>
                  <p className="day-report-note mt-1 text-xs text-white/55">
                    Paid orders only. Revenue is calculated for this specific
                    date.
                  </p>
                </div>

                <div className="day-report-table-wrap overflow-x-hidden">
                  <table className="day-report-table w-full table-fixed text-sm text-white">
                    <thead className="bg-[#17100c]/95">
                      <tr className="border-b border-white/10 text-left text-white/55">
                        <th className="w-[12%] px-2 py-3 text-[11px] font-medium">
                          Order
                        </th>
                        <th className="w-[25%] px-2 py-3 text-[11px] font-medium">
                          Customer
                        </th>
                        <th className="w-[14%] px-2 py-3 text-[11px] font-medium">
                          Phone
                        </th>
                        <th className="w-[8%] px-2 py-3 text-[11px] font-medium">
                          Hunters
                        </th>
                        <th className="w-[10%] px-2 py-3 text-[11px] font-medium">
                          Waivers
                        </th>
                        <th className="w-[19%] px-2 py-3 text-[11px] font-medium">
                          Dates
                        </th>
                        <th className="w-[12%] px-2 py-3 text-[11px] font-medium text-right">
                          Revenue
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {reportRows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-white/5 align-top transition hover:bg-white/[0.025]"
                        >
                          <td className="break-words px-2 py-3 font-mono text-[11px] leading-5 text-white/85">
                            {row.shortId}
                          </td>

                          <td className="px-2 py-3">
                            <div className="day-report-customer-name break-words text-[12px] leading-5  text-white">
                              {row.customerName}
                            </div>
                            <div className="day-report-customer-email mt-1 break-words text-[10px] leading-4 text-white/50">
                              {row.email}
                            </div>
                          </td>

                          <td className="break-words px-2 py-3 text-[11px] leading-5 text-white/75">
                            {row.phone}
                          </td>

                          <td className="px-2 py-3 text-[11px] leading-5 text-white/85">
                            {row.hunters}
                          </td>

                          <td className="px-2 py-3 text-[11px] leading-5 text-white/75">
                            {row.waiverLabel}
                          </td>

                          <td className="break-words px-2 py-3 text-[11px] leading-5 text-white/75">
                            {row.bookedDates}
                          </td>

                          <td className="px-2 py-3 text-right text-[11px] leading-5 font-medium text-white whitespace-nowrap">
                            {currency(row.dayRevenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================================================
 * PAGE
 * ======================================================= */

export default function DayDetail() {
  const { id } = useParams<{ id: string }>(); // YYYY-MM-DD

  const [avail, setAvail] = useState<AvailabilityDoc | null>(null);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [selected, setSelected] = useState<OrderDoc | null>(null);
  const [phoneMap, setPhoneMap] = useState<Record<string, string>>({});
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const nice = useMemo(() => (id ? friendlyDay(id) : ""), [id]);
  const headerDate = useMemo(() => (id ? formatHeaderDate(id) : ""), [id]);

  // availability/{id}
  useEffect(() => {
    if (!id) return;
    (async () => {
      const s = await getDoc(doc(db, "availability", id));
      setAvail(
        s.exists()
          ? ({ id: s.id, ...(s.data() as any) } as AvailabilityDoc)
          : null
      );
    })();
  }, [id]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const config = await getSeasonConfig();
        if (active) setSeasonConfig(config);
      } catch (error) {
        console.error("Failed to load season config:", error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // paid orders containing this day
  useEffect(() => {
    if (!id) return;
    const qToday = query(
      collection(db, "orders"),
      where("booking.dates", "array-contains", id),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(qToday, (snap) => {
      const docs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as OrderDoc[];

      setOrders(docs);
    });

    return () => unsub();
  }, [id]);

  // Resolve phones for each order:
  // 1) users/{userId}.phone
  // 2) fallback to order.customer.phone
  useEffect(() => {
    if (!orders.length) {
      setPhoneMap({});
      return;
    }

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        orders.map(async (order) => {
          let resolved = order.customer?.phone?.trim() || "";

          if (order.userId) {
            try {
              const userSnap = await getDoc(doc(db, "users", order.userId));
              const userPhone = userSnap.exists()
                ? String((userSnap.data() as any)?.phone ?? "").trim()
                : "";

              if (userPhone) {
                resolved = userPhone;
              }
            } catch {
              // keep fallback
            }
          }

          return [order.id, resolved] as const;
        })
      );

      if (!cancelled) {
        setPhoneMap(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orders]);

  const confirmedOrders = useMemo(() => {
    return orders.filter((o) => normalizeStatus(o.status) === "paid");
  }, [orders]);

  const pendingOrders = useMemo(() => {
    return orders.filter((o) => normalizeStatus(o.status) === "pending");
  }, [orders]);

  const totalHuntersFromOrders = useMemo(
    () =>
      confirmedOrders.reduce(
        (sum, o) => sum + (o.booking?.numberOfHunters ?? 0),
        0
      ),
    [confirmedOrders]
  );

  const totalSignedWaivers = useMemo(() => {
    return confirmedOrders.reduce(
      (sum, o) => sum + getWaiverCounts(o).signed,
      0
    );
  }, [confirmedOrders]);

  const totalWaivers = useMemo(() => {
    return confirmedOrders.reduce((sum, o) => {
      const counts = getWaiverCounts(o);
      return sum + counts.total;
    }, 0);
  }, [confirmedOrders]);

  const pendingHunters = useMemo(() => {
    return pendingOrders.reduce(
      (sum, o) => sum + (o.booking?.numberOfHunters ?? 0),
      0
    );
  }, [pendingOrders]);

  const paidRevenueForDay = useMemo(() => {
    if (!id || !seasonConfig) return 0;

    return confirmedOrders.reduce((sum, order) => {
      return sum + computeBookingRevenueForDay(order, id, seasonConfig);
    }, 0);
  }, [confirmedOrders, id, seasonConfig]);

  const maxHuntersForDay = 100;
  const huntersOnThisDay = avail?.huntersBooked ?? totalHuntersFromOrders;
  const remainingCapacity = Math.max(0, maxHuntersForDay - huntersOnThisDay);
  const waiverCompletionPct =
    totalWaivers > 0
      ? Math.round((totalSignedWaivers / totalWaivers) * 100)
      : 0;

  return (
    <div className="min-h-screen px-4 pb-10 pt-36 text-[var(--color-text)] md:px-8 lg:px-14">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="mt-4 text-4xl font-acumin tracking-tight text-white md:text-5xl">
              {headerDate}
            </h1>
            <p className="mt-3 max-w-2xl text-base text-white/60">
              Booking breakdown, customer contact details, attendee visibility,
              and waiver tracking for this day.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsReportOpen(true)}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/88 shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition hover:bg-white/[0.1] hover:text-white"
            >
              Create report
            </button>

            <Link
              to="/admin"
              className="inline-flex items-center justify-center p-2 font-medium text-[var(--color-accent-gold)] transition hover:text-[var(--color-accent-gold-hover)] hover:brightness-105"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/50">
              Hunters on this day
            </div>
            <div className="mt-3 text-4xl font-semibold text-white">
              <CountUp end={huntersOnThisDay} duration={0.6} />
            </div>
            <div className="mt-3 text-sm text-white/70">
              {huntersOnThisDay} / {maxHuntersForDay} capacity
            </div>
            <div className="mt-1 text-sm text-white/50">
              {remainingCapacity} spot{remainingCapacity === 1 ? "" : "s"} left
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/50">
              Paid orders
            </div>
            <div className="mt-3 text-4xl font-semibold text-white">
              <CountUp end={confirmedOrders.length} duration={0.6} />
            </div>
            <div className="mt-3 text-sm text-white/70">For this day</div>
            <div className="mt-1 text-sm text-white/50">
              {totalHuntersFromOrders} confirmed hunter
              {totalHuntersFromOrders === 1 ? "" : "s"}
              {pendingOrders.length > 0
                ? ` • ${pendingOrders.length} pending`
                : ""}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/50">
              Revenue
            </div>
            <div className="mt-3 text-4xl font-semibold text-white">
              {currency(paidRevenueForDay)}
            </div>
            <div className="mt-3 text-sm text-white/70">For this day only</div>
            <div className="mt-1 text-sm text-white/50">
              Calculated from pricing windows
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/50">
              Waivers
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-4xl font-semibold text-white">
                {totalSignedWaivers}
              </span>
              <span className="pb-1 text-lg text-white/45">
                / {totalWaivers}
              </span>
            </div>
            <div className="mt-3 text-sm text-white/70">
              {totalWaivers > 0
                ? `${waiverCompletionPct}% complete`
                : "No attendee waiver records yet"}
            </div>
            <div className="mt-2">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                  totalWaivers === 0
                    ? "border-white/10 bg-white/5 text-white/60"
                    : totalSignedWaivers === totalWaivers
                    ? "border-emerald-400/20 bg-emerald-400/15 text-emerald-200"
                    : "border-amber-400/20 bg-amber-400/15 text-amber-200"
                }`}
              >
                {totalWaivers === 0
                  ? "Not started"
                  : totalSignedWaivers === totalWaivers
                  ? "Complete"
                  : "Action needed"}
              </span>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/50">
              Party Deck
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {avail?.partyDeckBooked ? "Reserved" : "Available"}
            </div>
            <div className="mt-3">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-sm ${
                  avail?.partyDeckBooked
                    ? "border-rose-400/20 bg-rose-400/15 text-rose-200"
                    : "border-emerald-400/20 bg-emerald-400/15 text-emerald-200"
                }`}
              >
                {avail?.partyDeckBooked
                  ? "Reserved for this date"
                  : "Open for this date"}
              </span>
            </div>
            <div className="mt-2 text-sm text-white/50">
              {avail?.isOffSeason ? "Off-season day" : "In-season day"}
            </div>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] shadow-[0_24px_70px_rgba(0,0,0,0.26)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-5 md:flex-row md:items-end md:justify-between md:px-6">
            <div>
              <h2 className="mt-1 font-acumin text-2xl text-white">
                Bookings for this day
              </h2>
            </div>

            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/60">
              {id ? formatLongDate(id) : "—"}
            </div>
          </div>

          {confirmedOrders.length === 0 ? (
            <div className="px-6 py-16 text-center text-white/60">
              No confirmed bookings for this day.
            </div>
          ) : (
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[980px] text-sm text-white">
                <thead className="sticky top-0 z-[1] bg-[#17100c]">
                  <tr className="border-b border-white/10 text-left text-white/55">
                    <th className="px-6 py-3 font-medium">Order</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 font-medium">Phone</th>
                    <th className="px-6 py-3 font-medium">Hunters</th>
                    <th className="px-6 py-3 font-medium">Party Deck</th>
                    <th className="px-6 py-3 font-medium">Booked Dates</th>
                    <th className="px-6 py-3 font-medium">Waivers</th>
                    <th className="px-6 py-3 font-medium">Total</th>
                    <th className="px-6 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {confirmedOrders.map((o) => {
                    const hunters = o.booking?.numberOfHunters ?? 0;
                    const deckToday = (
                      o.booking?.partyDeckDates ?? []
                    ).includes(id!)
                      ? "Reserved"
                      : "No";
                    const dates =
                      o.booking?.dates?.map(friendlyDay).join(", ") ?? "—";
                    const waiver = getWaiverCounts(o);
                    const resolvedPhone =
                      phoneMap[o.id] || o.customer?.phone || "";

                    return (
                      <tr
                        key={o.id}
                        className="cursor-pointer border-b border-white/5 transition hover:bg-white/[0.03]"
                        onClick={() => setSelected(o)}
                      >
                        <td className="px-6 py-4 font-mono text-white/85">
                          {shortOrderId(o.id)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">
                            {getCustomerName(o)}
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            {o.customer?.email || "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-white/75">
                          {formatPhone(resolvedPhone)}
                        </td>
                        <td className="px-6 py-4 text-white/85">{hunters}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              deckToday === "Reserved"
                                ? "bg-amber-400/15 text-amber-200"
                                : "bg-white/10 text-white/70"
                            }`}
                          >
                            {deckToday}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-white/75">{dates}</td>
                        <td className="px-6 py-4 text-white/75">
                          {waiver.total
                            ? `${waiver.signed}/${waiver.total}`
                            : "—"}
                        </td>
                        <td className="px-6 py-4 font-medium text-white">
                          {currency(o.total ?? 0)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(o);
                            }}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10"
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="mt-8 overflow-hidden rounded-[32px] border border-amber-400/15 bg-amber-400/[0.04] shadow-[0_24px_70px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 border-b border-amber-400/10 px-5 py-5 md:flex-row md:items-end md:justify-between md:px-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-amber-200/70">
                Pending payment
              </div>
              <h2 className="mt-1 font-acumin text-2xl text-white">
                Pending bookings for {nice}
              </h2>
              <p className="mt-2 text-sm text-white/55">
                Orders created for this date that have not completed payment
                yet. These should not be treated as confirmed.
              </p>
            </div>

            <div className="rounded-full border border-amber-400/15 bg-amber-400/10 px-3 py-1 text-sm text-amber-100/85">
              {pendingOrders.length} booking
              {pendingOrders.length === 1 ? "" : "s"} • {pendingHunters} hunter
              {pendingHunters === 1 ? "" : "s"}
            </div>
          </div>

          {pendingOrders.length === 0 ? (
            <div className="px-6 py-12 text-center text-white/55">
              No pending-payment bookings for this day.
            </div>
          ) : (
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full min-w-[980px] text-sm text-white">
                <thead className="sticky top-0 z-[1] bg-[#21160f]">
                  <tr className="border-b border-amber-400/10 text-left text-white/55">
                    <th className="px-6 py-3 font-medium">Order</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 font-medium">Phone</th>
                    <th className="px-6 py-3 font-medium">Hunters</th>
                    <th className="px-6 py-3 font-medium">Party Deck</th>
                    <th className="px-6 py-3 font-medium">Booked Dates</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Total</th>
                    <th className="px-6 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {pendingOrders.map((o) => {
                    const hunters = o.booking?.numberOfHunters ?? 0;
                    const deckToday = (
                      o.booking?.partyDeckDates ?? []
                    ).includes(id!)
                      ? "Reserved"
                      : "No";
                    const dates =
                      o.booking?.dates?.map(friendlyDay).join(", ") ?? "—";
                    const resolvedPhone =
                      phoneMap[o.id] || o.customer?.phone || "";

                    return (
                      <tr
                        key={o.id}
                        className="cursor-pointer border-b border-amber-400/5 transition hover:bg-amber-400/[0.04]"
                        onClick={() => setSelected(o)}
                      >
                        <td className="px-6 py-4 font-mono text-white/85">
                          {shortOrderId(o.id)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">
                            {getCustomerName(o)}
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            {o.customer?.email || "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-white/75">
                          {formatPhone(resolvedPhone)}
                        </td>
                        <td className="px-6 py-4 text-white/85">{hunters}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              deckToday === "Reserved"
                                ? "bg-amber-400/15 text-amber-200"
                                : "bg-white/10 text-white/70"
                            }`}
                          >
                            {deckToday}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-white/75">{dates}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/15 px-2.5 py-1 text-xs font-medium text-amber-200">
                            Pending payment
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-white">
                          {currency(o.total ?? 0)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(o);
                            }}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10"
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected && id && (
          <OrderDetailsModal
            order={selected}
            dayId={id}
            resolvedPhone={phoneMap[selected.id] || selected.customer?.phone}
            onClose={() => setSelected(null)}
          />
        )}

        {isReportOpen && id && (
          <DayReportPreviewModal
            dayId={id}
            orders={orders}
            phoneMap={phoneMap}
            seasonConfig={seasonConfig}
            onClose={() => setIsReportOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
