import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import CountUp from "react-countup";
import { db } from "../firebase/firebaseConfig";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import { formatLongDate } from "../utils/formatDate";
import type { Attendee, PricingWindow, SeasonConfig } from "../types/Types";

type AvailabilityDoc = {
  id: string;
  huntersBooked: number;
  partyDeckBooked: boolean;
  isOffSeason?: boolean;
};

type Booking = {
  dates: string[];
  numberOfHunters?: number;
  partyDeckDates?: string[];
  price?: number;
  attendees?: Attendee[];
  notes?: string;
  backTheBlueAccepted?: boolean;
};

export type MerchItem = {
  name?: string;
  quantity?: number;
  price?: number;
  sku?: string;
  shipped?: boolean;
  shippedAt?: any;
  tracking?: string | null;
  carrier?: string | null;
};

export type OrderDoc = {
  id: string;
  status?: "pending" | "paid" | "cancelled" | "refunded";
  createdAt?: any;
  total?: number;
  amountPaid?: number;
  amountRefunded?: number;
  refundedAmount?: number;
  customer?: { firstName?: string; lastName?: string; email?: string };
  booking?: Booking;
  merchItems?: Record<string, MerchItem>;
};

type RangeKey = "season" | "custom";

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parseIsoDateLocal(iso?: string) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function startOfDay(d: Date) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t;
}
function endOfDay(d: Date) {
  const t = new Date(d);
  t.setHours(23, 59, 59, 999);
  return t;
}

function maxDate(a: Date, b: Date) {
  return a.getTime() > b.getTime() ? a : b;
}
function minDate(a: Date, b: Date) {
  return a.getTime() < b.getTime() ? a : b;
}
function currency(n = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
function shortId(id: string) {
  if (!id) return "—";
  return id.length <= 12 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}
function getCustomerName(order: OrderDoc) {
  return (
    `${order.customer?.firstName ?? ""} ${
      order.customer?.lastName ?? ""
    }`.trim() || "—"
  );
}
function getCreatedDate(order: OrderDoc) {
  const d = order.createdAt?.toDate?.();
  return d instanceof Date ? d : null;
}
function getBookingDateSummary(dates: string[] = []) {
  if (!dates.length) return "—";
  const sorted = [...dates].sort();
  if (sorted.length === 1) return formatLongDate(sorted[0]);
  return `${formatLongDate(sorted[0])} → ${formatLongDate(
    sorted[sorted.length - 1]
  )}`;
}
function getWaiverCounts(order: OrderDoc) {
  const attendees = order.booking?.attendees ?? [];
  if (!attendees.length) {
    const hunters = order.booking?.numberOfHunters ?? 0;
    return {
      signed: 0,
      total: hunters,
      label: hunters ? `0 / ${hunters} signed` : "—",
    };
  }
  const signed = attendees.filter((a) => !!a.waiverSigned).length;
  return {
    signed,
    total: attendees.length,
    label: `${signed} / ${attendees.length} signed`,
  };
}
function orderHasBookingInRange(
  order: OrderDoc,
  fromIso: string,
  toIso: string
) {
  const dates = order.booking?.dates ?? [];
  return dates.some((d) => d >= fromIso && d <= toIso);
}

function addDaysLocal(iso: string, days: number) {
  const base = parseIsoDateLocal(iso);
  if (!base) return iso;
  base.setDate(base.getDate() + days);
  return toISO(base);
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

  // Fri / Sat / Sun fallback to weekend single-day rate
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

    // Flat-rate window or no window → assign a simple day rate per date
    if (!window || window.type === "flat") {
      for (const iso of group.dates) {
        rateMap[iso] =
          window?.rate ?? getFallbackSingleDayRate(iso, seasonConfig);
      }
      continue;
    }

    // Package window → derive the effective per-day rate from the booked run
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

function computeBookingRevenueInRange(
  order: OrderDoc,
  fromIso: string,
  toIso: string,
  seasonConfig: SeasonConfig
) {
  const bookingDates = order.booking?.dates ?? [];
  if (!bookingDates.length) return 0;

  const hunters = getHuntersForOrder(order);
  if (!hunters) return 0;

  const perHunterRateMap = buildPerHunterDailyRateMap(
    bookingDates,
    seasonConfig
  );

  let subtotal = bookingDates
    .filter((iso) => iso >= fromIso && iso <= toIso)
    .reduce((sum, iso) => {
      return sum + (perHunterRateMap[iso] ?? 0) * hunters;
    }, 0);

  const partyDeckDaysInRange = (order.booking?.partyDeckDates ?? []).filter(
    (iso) => iso >= fromIso && iso <= toIso
  ).length;

  subtotal += partyDeckDaysInRange * (seasonConfig.partyDeckRatePerDay ?? 0);

  const refunded =
    typeof order.amountRefunded === "number"
      ? order.amountRefunded
      : typeof order.refundedAmount === "number"
      ? order.refundedAmount
      : 0;

  const bookingTotal =
    typeof order.booking?.price === "number" ? order.booking.price : 0;

  if (refunded > 0 && bookingTotal > 0 && subtotal > 0) {
    const proportionalRefund = refunded * (subtotal / bookingTotal);
    subtotal = Math.max(0, subtotal - proportionalRefund);
  }

  return subtotal;
}

function computeRange(
  key: RangeKey,
  seasonConfig: SeasonConfig | null,
  cf?: string,
  ct?: string
) {
  const now = new Date();
  const seasonStart =
    parseIsoDateLocal(seasonConfig?.seasonStart) ?? startOfDay(now);
  const seasonEnd = endOfDay(parseIsoDateLocal(seasonConfig?.seasonEnd) ?? now);

  let from = seasonStart;
  let to = seasonEnd;

  if (key === "custom") {
    const customFrom = parseIsoDateLocal(cf) ?? seasonStart;
    const customTo = endOfDay(
      parseIsoDateLocal(ct) ?? parseIsoDateLocal(cf) ?? seasonEnd
    );
    from = maxDate(customFrom, seasonStart);
    to = minDate(customTo, seasonEnd);
  }

  if (from > to) {
    from = seasonStart;
    to = seasonEnd;
  }

  return { from, to, fromIso: toISO(from), toIso: toISO(to) };
}
function MetricCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: ReactNode;
  sublabel?: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.03)] backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.28)] p-5 md:p-6">
      <div className="text-[11px] lg:text-[13px] uppercase tracking-[0.24em] text-white/55">
        {label}
      </div>
      <div className="mt-3 text-3xl md:text-4xl font-semibold text-white">
        {value}
      </div>
      {sublabel && <div className="mt-2 text-sm text-white/55">{sublabel}</div>}
    </div>
  );
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-400/15 text-emerald-200 border-emerald-300/20"
      : tone === "warning"
      ? "bg-amber-400/15 text-amber-100 border-amber-300/20"
      : tone === "danger"
      ? "bg-rose-400/15 text-rose-100 border-rose-300/20"
      : "bg-white/5 text-white/75 border-white/10";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}

function MerchOrderModal({
  order,
  onClose,
}: {
  order: OrderDoc;
  onClose: () => void;
}) {
  const items = Object.entries(order.merchItems ?? {}) as Array<
    [string, MerchItem]
  >;

  async function toggleShipped(key: string, next: boolean) {
    await updateDoc(doc(db, "orders", order.id), {
      [`merchItems.${key}.shipped`]: next,
      [`merchItems.${key}.shippedAt`]: next ? serverTimestamp() : null,
    });
  }

  async function saveTracking(key: string, value: string) {
    await updateDoc(doc(db, "orders", order.id), {
      [`merchItems.${key}.tracking`]: value || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0f0b09] text-white shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-lg font-semibold">Merch order details</div>
            <div className="mt-1 text-sm text-white/50">{order.id}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 border-b border-white/10 px-5 py-5 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              Customer
            </div>
            <div className="mt-2 font-medium">{getCustomerName(order)}</div>
            {order.customer?.email && (
              <div className="mt-1 text-sm text-white/55">
                {order.customer.email}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              Status
            </div>
            <div className="mt-2">
              <StatusPill
                tone={
                  order.status === "paid"
                    ? "success"
                    : order.status === "pending"
                    ? "warning"
                    : "neutral"
                }
              >
                {order.status ?? "—"}
              </StatusPill>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              Order total
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {currency(order.total ?? 0)}
            </div>
          </div>
        </div>

        <div className="order-details-scroll max-h-[60vh] overflow-auto px-5 py-4 pr-4">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 bg-[#0f0b09]">
              <tr className="border-b border-white/10 text-left text-white/55">
                <th className="py-3 pr-4 font-medium">Item</th>
                <th className="py-3 pr-4 font-medium">Qty</th>
                <th className="py-3 pr-4 font-medium">Price</th>
                <th className="py-3 pr-4 font-medium">Line total</th>
                <th className="py-3 pr-4 font-medium">Shipped</th>
                <th className="py-3 font-medium">Tracking</th>
              </tr>
            </thead>
            <tbody>
              {items.map(([key, item]) => {
                const qty = item.quantity ?? 0;
                const price = item.price ?? 0;
                return (
                  <tr key={key} className="border-b border-white/5 align-top">
                    <td className="py-3 pr-4">
                      <div className="font-medium">
                        {item.name ?? item.sku ?? key}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        {item.sku ?? key}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{qty}</td>
                    <td className="py-3 pr-4">{currency(price)}</td>
                    <td className="py-3 pr-4">{currency(qty * price)}</td>
                    <td className="py-3 pr-4">
                      <input
                        type="checkbox"
                        checked={!!item.shipped}
                        onChange={(e) =>
                          toggleShipped(key, e.currentTarget.checked)
                        }
                        className="h-4 w-4 accent-[var(--color-accent-gold)]"
                      />
                    </td>
                    <td className="py-3">
                      <input
                        defaultValue={item.tracking ?? ""}
                        onBlur={(e) => saveTracking(key, e.currentTarget.value)}
                        placeholder="Tracking #"
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [range, setRange] = useState<RangeKey>("season");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [merchSearch, setMerchSearch] = useState("");
  const [bookingSearch, setBookingSearch] = useState("");

  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);
  const [seasonLoading, setSeasonLoading] = useState(true);

  const [availability, setAvailability] = useState<AvailabilityDoc[]>([]);
  const [paidRevenue, setPaidRevenue] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [merchOrders, setMerchOrders] = useState<OrderDoc[]>([]);
  const [bookingOrders, setBookingOrders] = useState<OrderDoc[]>([]);
  const [selectedMerch, setSelectedMerch] = useState<OrderDoc | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(
    null
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const config = await getSeasonConfig();
        if (!mounted) return;
        setSeasonConfig(config);
        setCustomFrom(config.seasonStart);
        setCustomTo(config.seasonEnd);
      } catch (error) {
        console.error(error);
      } finally {
        if (mounted) setSeasonLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const { from, to, fromIso, toIso } = useMemo(
    () => computeRange(range, seasonConfig, customFrom, customTo),
    [range, seasonConfig, customFrom, customTo]
  );

  useEffect(() => {
    if (!seasonConfig) return;
    const qAvail = query(
      collection(db, "availability"),
      where("id", ">=", fromIso),
      where("id", "<=", toIso),
      orderBy("id")
    );

    const unsub = onSnapshot(qAvail, (snap) => {
      const rows = snap.docs.map((d) => d.data() as AvailabilityDoc);
      const seeded: Record<string, AvailabilityDoc> = {};
      let cur = new Date(from);
      const end = new Date(to);

      while (cur <= end) {
        const id = toISO(cur);
        seeded[id] = {
          id,
          huntersBooked: 0,
          partyDeckBooked: false,
          isOffSeason:
            id < seasonConfig.seasonStart || id > seasonConfig.seasonEnd,
        };
        cur.setDate(cur.getDate() + 1);
      }

      for (const row of rows) {
        seeded[row.id] = {
          ...seeded[row.id],
          ...row,
          isOffSeason:
            typeof row.isOffSeason === "boolean"
              ? row.isOffSeason
              : row.id < seasonConfig.seasonStart ||
                row.id > seasonConfig.seasonEnd,
        };
      }

      setAvailability(
        Object.values(seeded).sort((a, b) => a.id.localeCompare(b.id))
      );
    });

    return () => unsub();
  }, [from, to, fromIso, toIso, seasonConfig]);

  useEffect(() => {
    const qOrders = query(
      collection(db, "orders"),
      orderBy("createdAt", "desc"),
      limit(500)
    );
    const unsub = onSnapshot(qOrders, (snap) => {
      const docs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as OrderDoc[];

      let revenue = 0;
      let count = 0;

      for (const order of docs) {
        const hasBookingInRange = orderHasBookingInRange(order, fromIso, toIso);
        if (!hasBookingInRange) continue;

        const isPaidLike = ["paid", "refunded"].includes(order.status ?? "");
        if (!isPaidLike) continue;

        count += 1;

        if (seasonConfig) {
          revenue += computeBookingRevenueInRange(
            order,
            fromIso,
            toIso,
            seasonConfig
          );
        }
      }
      setPaidCount(count);
      setPaidRevenue(revenue);

      const merchTerm = merchSearch.trim().toLowerCase();
      const filteredMerch = docs.filter((order) => {
        const hasMerch =
          !!order.merchItems && Object.keys(order.merchItems).length > 0;
        if (!hasMerch) return false;
        const created = getCreatedDate(order);
        if (!created || created < from || created > to) return false;
        if (!merchTerm) return true;
        return (
          order.id.toLowerCase().includes(merchTerm) ||
          getCustomerName(order).toLowerCase().includes(merchTerm)
        );
      });
      setMerchOrders(filteredMerch.slice(0, 200));

      const bookingTerm = bookingSearch.trim().toLowerCase();
      const filteredBookings = docs.filter((order) => {
        if (!order.booking?.dates?.length) return false;
        if (!orderHasBookingInRange(order, fromIso, toIso)) return false;
        if (!bookingTerm) return true;
        return (
          order.id.toLowerCase().includes(bookingTerm) ||
          getCustomerName(order).toLowerCase().includes(bookingTerm) ||
          (order.customer?.email ?? "").toLowerCase().includes(bookingTerm)
        );
      });
      setBookingOrders(filteredBookings.slice(0, 200));
    });
    return () => unsub();
  }, [from, to, fromIso, toIso, merchSearch, bookingSearch]);

  const huntersBooked = useMemo(
    () => availability.reduce((sum, day) => sum + (day.huntersBooked ?? 0), 0),
    [availability]
  );
  const reservedPartyDeckDays = useMemo(
    () => availability.filter((day) => day.partyDeckBooked).length,
    [availability]
  );
  const availablePartyDeckDays = Math.max(
    availability.length - reservedPartyDeckDays,
    0
  );
  const maxHuntersPerDay = seasonConfig?.maxHuntersPerDay ?? 75;

  async function toggleAttendeeWaiver(
    order: OrderDoc,
    attendeeIndex: number,
    next: boolean
  ) {
    const attendees = [...(order.booking?.attendees ?? [])];
    if (!attendees[attendeeIndex]) return;
    attendees[attendeeIndex] = {
      ...attendees[attendeeIndex],
      waiverSigned: next,
    };
    await updateDoc(doc(db, "orders", order.id), {
      "booking.attendees": attendees,
    });
  }

  if (seasonLoading) {
    return (
      <div className="min-h-screen px-6 py-20 text-white">
        Loading admin dashboard…
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[1600px] px-4 pb-16 pt-28 text-white md:px-8">
      <div className="mb-8 rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,120,0.12),transparent_28%),rgba(255,255,255,0.04)] px-5 py-6 shadow-[0_25px_90px_rgba(0,0,0,0.28)] md:px-8 md:py-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="mt-4 text-3xl font-acumin font-semibold tracking-tight ">
              Admin Dashboard
            </h1>

            <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/60">
              <StatusPill>
                <span className="lg:text-lg">
                  {" "}
                  Season: {formatLongDate(
                    seasonConfig?.seasonStart ?? fromIso
                  )}{" "}
                  → {formatLongDate(seasonConfig?.seasonEnd ?? toIso)}
                </span>
              </StatusPill>
              <StatusPill>
                <span className="lg:text-lg">
                  {availability.length} day view
                </span>
              </StatusPill>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <button
              onClick={() => setRange("season")}
              className={`rounded-xl border px-3.5 py-2 text-sm transition ${
                range === "season"
                  ? "border-[var(--color-accent-gold)] bg-[var(--color-accent-gold)] text-black"
                  : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
              }`}
            >
              Season
            </button>
            <button
              onClick={() => setRange("custom")}
              className={`rounded-xl border px-3.5 py-2 text-sm transition ${
                range === "custom"
                  ? "border-[var(--color-accent-gold)] bg-[var(--color-accent-gold)] text-black"
                  : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
              }`}
            >
              Custom
            </button>
            {range === "custom" && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                <input
                  type="date"
                  min={seasonConfig?.seasonStart}
                  max={seasonConfig?.seasonEnd}
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                />
                <span className="text-white/45">to</span>
                <input
                  type="date"
                  min={seasonConfig?.seasonStart}
                  max={seasonConfig?.seasonEnd}
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Hunters booked"
          value={<CountUp end={huntersBooked} duration={0.7} separator="," />}
          sublabel={`${formatLongDate(fromIso)} → ${formatLongDate(toIso)}`}
        />
        <MetricCard
          label="Party deck reserved days"
          value={
            <CountUp end={reservedPartyDeckDays} duration={0.7} separator="," />
          }
          sublabel={`${availablePartyDeckDays} days still available in this view`}
        />
        <MetricCard
          label="Paid orders"
          value={<CountUp end={paidCount} duration={0.6} />}
          sublabel=""
        />
        <MetricCard
          label="Revenue"
          value={currency(paidRevenue)}
          sublabel="Booking revenue for selected dates"
        />
      </div>

      <div className="mb-8 rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.05)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-acumin font-semibold md:text-2xl">
              Season day availability
            </h2>
          </div>
          <StatusPill>
            {fromIso} → {toIso}
          </StatusPill>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="order-details-scroll max-h-[430px] overflow-auto pr-1">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10 bg-[#140d09]">
                <tr className="border-b border-white/10 text-left text-white/55">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Hunters</th>
                  <th className="px-4 py-3 font-medium">Capacity</th>
                  <th className="px-4 py-3 font-medium">Party Deck</th>
                  <th className="px-4 py-3 font-medium">Season</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {availability.map((day) => {
                  const remaining = Math.max(
                    maxHuntersPerDay - (day.huntersBooked ?? 0),
                    0
                  );
                  return (
                    <>
                      <tr
                        key={day.id}
                        className="border-b border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium">
                            {formatLongDate(day.id, { weekday: true })}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {day.huntersBooked ?? 0}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {remaining} left
                        </td>
                        <td className="px-4 py-3 align-top">
                          <StatusPill
                            tone={day.partyDeckBooked ? "warning" : "success"}
                          >
                            {day.partyDeckBooked ? "Reserved" : "Available"}
                          </StatusPill>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <StatusPill
                            tone={day.isOffSeason ? "neutral" : "success"}
                          >
                            {day.isOffSeason ? "Off-season" : "In-season"}
                          </StatusPill>
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <div className="flex justify-end gap-2">
                            <Link
                              to={`/admin/day/${day.id}`}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                            >
                              View day
                            </Link>
                          </div>
                        </td>
                      </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mb-8 rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.05)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold md:text-2xl font-acumin">
              Booking orders
            </h2>
          </div>
          <input
            value={bookingSearch}
            onChange={(e) => setBookingSearch(e.target.value)}
            placeholder="Search order, customer, or email…"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 lg:w-[320px]"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="order-details-scroll max-h-[520px] overflow-auto pr-1">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="sticky top-0 z-10 bg-[#140d09]">
                <tr className="border-b border-white/10 text-left text-white/55">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Booked dates</th>
                  <th className="px-4 py-3 font-medium">Hunters</th>
                  <th className="px-4 py-3 font-medium">Waivers</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Payment Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookingOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-white/45"
                    >
                      No booking orders in this date window.
                    </td>
                  </tr>
                )}
                {bookingOrders.map((order) => {
                  const expanded = expandedBookingId === order.id;
                  const waiver = getWaiverCounts(order);
                  return (
                    <>
                      <tr
                        key={order.id}
                        className="border-b border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                      >
                        <td className="px-4 py-3 align-top">
                          <button
                            onClick={() =>
                              navigator.clipboard?.writeText(order.id)
                            }
                            className="font-mono text-white/80 hover:text-white"
                          >
                            {shortId(order.id)}
                          </button>
                          <div className="mt-1 text-xs text-white/35">
                            {order.id}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium">
                            {getCustomerName(order)}
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            {order.customer?.email ?? "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {getBookingDateSummary(order.booking?.dates ?? [])}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {order.booking?.numberOfHunters ?? 0}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <StatusPill
                            tone={
                              waiver.total > 0 && waiver.signed === waiver.total
                                ? "success"
                                : "warning"
                            }
                          >
                            {waiver.label}
                          </StatusPill>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {currency(order.total ?? 0)}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <StatusPill
                            tone={
                              order.status === "paid"
                                ? "success"
                                : order.status === "pending"
                                ? "warning"
                                : order.status === "refunded"
                                ? "danger"
                                : "neutral"
                            }
                          >
                            {order.status ?? "—"}
                          </StatusPill>
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <button
                            onClick={() =>
                              setExpandedBookingId(expanded ? null : order.id)
                            }
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                          >
                            {expanded ? "Collapse" : "Expand"}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-white/5 bg-black/20">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-white/80">
                                    Booking breakdown
                                  </div>
                                  <StatusPill>
                                    {(order.booking?.dates ?? []).length} day(s)
                                  </StatusPill>
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                  {(order.booking?.dates ?? []).map((date) => (
                                    <div
                                      key={date}
                                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"
                                    >
                                      <div className="text-sm font-medium">
                                        {formatLongDate(date, {
                                          weekday: true,
                                        })}
                                      </div>
                                      <div className="mt-1 text-xs text-white/45">
                                        {date}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {!!order.booking?.partyDeckDates?.length && (
                                  <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-3 text-sm text-amber-100">
                                    Party deck reserved for:{" "}
                                    {order.booking.partyDeckDates
                                      .map((date) => formatLongDate(date))
                                      .join(", ")}
                                  </div>
                                )}
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                <div className="text-sm font-medium text-white/80">
                                  Waiver status
                                </div>
                                <div className="mt-3 space-y-2">
                                  {(order.booking?.attendees ?? []).length >
                                  0 ? (
                                    (order.booking?.attendees ?? []).map(
                                      (attendee, index) => (
                                        <div
                                          key={`${attendee.fullName}-${index}`}
                                          className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
                                        >
                                          <div>
                                            <div className="font-medium">
                                              {attendee.fullName}
                                            </div>
                                            <div className="text-xs text-white/45">
                                              Hunter {index + 1}
                                            </div>
                                          </div>
                                          <label className="flex items-center gap-2 text-sm text-white/75">
                                            <input
                                              type="checkbox"
                                              checked={!!attendee.waiverSigned}
                                              onChange={(e) =>
                                                toggleAttendeeWaiver(
                                                  order,
                                                  index,
                                                  e.currentTarget.checked
                                                )
                                              }
                                              className="h-4 w-4 accent-[var(--color-accent-gold)]"
                                            />
                                            Signed
                                          </label>
                                        </div>
                                      )
                                    )
                                  ) : (
                                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/45">
                                      No attendee names saved yet. Hunter count:{" "}
                                      {order.booking?.numberOfHunters ?? 0}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.05)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] hidden">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold md:text-2xl font-acumin">
              Merch orders
            </h2>
          </div>
          <input
            value={merchSearch}
            onChange={(e) => setMerchSearch(e.target.value)}
            placeholder="Search order id or customer…"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 lg:w-[280px]"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="order-details-scroll max-h-[460px] overflow-auto pr-1">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="sticky top-0 z-10 bg-[#140d09]">
                <tr className="border-b border-white/10 text-left text-white/55">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {merchOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-white/45"
                    >
                      No merch orders in this date window.
                    </td>
                  </tr>
                )}
                {merchOrders.map((order) => {
                  const items = order.merchItems
                    ? (Object.values(order.merchItems) as MerchItem[])
                    : [];
                  const summary = items.length
                    ? items
                        .slice(0, 3)
                        .map(
                          (item) =>
                            `${item.quantity ?? 0}× ${
                              item.name ?? item.sku ?? "Item"
                            }`
                        )
                        .join(", ")
                    : "—";
                  const created = getCreatedDate(order);
                  return (
                    <tr
                      key={order.id}
                      className="cursor-pointer border-b border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                      onClick={() => setSelectedMerch(order)}
                    >
                      <td className="px-4 py-3 font-mono text-white/80">
                        {shortId(order.id)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {getCustomerName(order)}
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          {order.customer?.email ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/75">
                        {summary}
                        {items.length > 3 ? "…" : ""}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          tone={
                            order.status === "paid"
                              ? "success"
                              : order.status === "pending"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {order.status ?? "—"}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3">
                        {currency(order.total ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        {created ? formatLongDate(toISO(created)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMerch(order);
                          }}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedMerch && (
        <MerchOrderModal
          order={selectedMerch}
          onClose={() => setSelectedMerch(null)}
        />
      )}
    </div>
  );
}
