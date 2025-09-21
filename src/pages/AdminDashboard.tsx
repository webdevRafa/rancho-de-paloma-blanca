// src/pages/AdminDashboard.tsx
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import CountUp from "react-countup";
import { db } from "../firebase/firebaseConfig";

/* =========================================================
 *                         Types (permissive)
 * These align with your Types.ts & MerchTypes.ts but are
 * kept inline to make this file drop-in safe.
 * =======================================================*/
type AvailabilityDoc = {
  id: string; // "YYYY-MM-DD"
  huntersBooked: number;
  partyDeckBooked: boolean;
  isOffSeason?: boolean;
  timestamp?: any;
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
  status?: "pending" | "paid" | "canceled" | "refunded";
  createdAt?: any; // Firebase Timestamp
  total?: number;
  customer?: { firstName?: string; lastName?: string; email?: string };
  booking?: Booking;
  merchItems?: Record<string, MerchItem>;
};

/* =========================================================
 *                      Date helpers & ranges
 * =======================================================*/
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function startOfWeek(d = new Date()) {
  const t = new Date(d);
  const dow = t.getDay(); // 0=Sun
  t.setDate(t.getDate() - dow);
  t.setHours(0, 0, 0, 0);
  return t;
}
function endOfWeek(d = new Date()) {
  const t = startOfWeek(d);
  t.setDate(t.getDate() + 6);
  t.setHours(23, 59, 59, 999);
  return t;
}
function startOfMonth(d = new Date()) {
  const t = new Date(d.getFullYear(), d.getMonth(), 1);
  t.setHours(0, 0, 0, 0);
  return t;
}
function endOfMonth(d = new Date()) {
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  t.setHours(23, 59, 59, 999);
  return t;
}
function friendlyDay(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "June",
    "July",
    "Aug",
    "Sept",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${MONTHS[(m ?? 1) - 1]} ${d ?? 1}`;
}

type RangeKey = "today" | "week" | "month" | "custom";
function computeRange(key: RangeKey, cf?: string, ct?: string) {
  const now = new Date();
  let from = new Date(now);
  let to = new Date(now);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  if (key === "week") {
    from = startOfWeek(now);
    to = endOfWeek(now);
  } else if (key === "month") {
    from = startOfMonth(now);
    to = endOfMonth(now);
  } else if (key === "custom") {
    if (cf) {
      const [y, m, d] = cf.split("-").map(Number);
      from = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
    }
    if (ct) {
      const [y, m, d] = ct.split("-").map(Number);
      to = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
    }
  }
  return { from, to, fromIso: toISO(from), toIso: toISO(to) };
}

/* =========================================================
 *                    Merch Order Modal
 * =======================================================*/
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

  const currency = (n = 0) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(n);

  async function toggleShipped(key: string, next: boolean) {
    try {
      await updateDoc(doc(db, "orders", order.id), {
        [`merchItems.${key}.shipped`]: next,
        [`merchItems.${key}.shippedAt`]: next ? serverTimestamp() : null,
      });
    } catch (err) {
      console.error(err);
      alert("Could not update shipped status.");
    }
  }

  async function saveTracking(key: string, v: string) {
    try {
      await updateDoc(doc(db, "orders", order.id), {
        [`merchItems.${key}.tracking`]: v || null,
      });
    } catch (err) {
      console.error(err);
      alert("Could not save tracking.");
    }
  }

  const fullName =
    `${order.customer?.firstName ?? ""} ${
      order.customer?.lastName ?? ""
    }`.trim() || "—";

  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-5xl rounded-2xl bg-white text-[var(--color-background)] shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-black/10">
          <div>
            <div className="text-xl font-bourbon">Merch Order</div>
            <div className="text-xs opacity-70 font-mono mt-1">{order.id}</div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10"
          >
            Close
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-3 p-4">
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-60 mb-1">Customer</div>
            <div className="font-semibold">{fullName}</div>
            {order.customer?.email && (
              <div className="text-sm opacity-80">{order.customer.email}</div>
            )}
          </div>
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-60 mb-1">Status</div>
            <div className="font-semibold uppercase">{order.status ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-60 mb-1">Order Total</div>
            <div className="font-semibold">{currency(order.total ?? 0)}</div>
          </div>
        </div>

        <div className="p-4 border-t border-black/10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-black/10">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Line Total</th>
                  <th className="py-2 pr-3">Shipped</th>
                  <th className="py-2 pr-3 w-44">Tracking</th>
                </tr>
              </thead>
              <tbody>
                {items.map(([key, it]) => {
                  const qty = it.quantity ?? 0;
                  const price = it.price ?? 0;
                  return (
                    <tr key={key} className="border-b border-black/5">
                      <td className="py-2 pr-3">
                        <div className="font-medium">
                          {it.name ?? it.sku ?? key}
                        </div>
                        <div className="text-xs opacity-60">
                          {it.sku ?? key}
                        </div>
                      </td>
                      <td className="py-2 pr-3">{qty}</td>
                      <td className="py-2 pr-3">${price.toFixed(2)}</td>
                      <td className="py-2 pr-3">${(qty * price).toFixed(2)}</td>
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          className="accent-[var(--color-accent-gold)]"
                          checked={!!it.shipped}
                          onChange={(e) =>
                            toggleShipped(key, e.currentTarget.checked)
                          }
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          defaultValue={it.tracking ?? ""}
                          placeholder="Tracking #"
                          className="w-full px-2 py-1 rounded-md border border-black/10"
                          onBlur={(e) =>
                            saveTracking(key, e.currentTarget.value)
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-black/10 bg-white"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
 *                          Page
 * =======================================================*/
export default function AdminDashboard() {
  // Controls
  const [range, setRange] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [merchSearch, setMerchSearch] = useState("");

  const { from, to, fromIso, toIso } = useMemo(
    () => computeRange(range, customFrom, customTo),
    [range, customFrom, customTo]
  );
  const todayIso = useMemo(() => toISO(new Date()), []);

  // Data
  const [availability, setAvailability] = useState<AvailabilityDoc[]>([]);
  const [todayAvail, setTodayAvail] = useState<AvailabilityDoc | null>(null);
  const [paidRevenue, setPaidRevenue] = useState<number>(0);
  const [paidCount, setPaidCount] = useState<number>(0);
  const [merchOrders, setMerchOrders] = useState<OrderDoc[]>([]);
  const [selectedMerch, setSelectedMerch] = useState<OrderDoc | null>(null);

  // Availability in range (seed missing days for continuous table)
  useEffect(() => {
    const qAvail = query(
      collection(db, "availability"),
      where("id", ">=", fromIso),
      where("id", "<=", toIso),
      orderBy("id")
    );
    const unsub = onSnapshot(qAvail, (snap) => {
      const rows: AvailabilityDoc[] = snap.docs.map((d) => d.data() as any);
      const seeded: Record<string, AvailabilityDoc> = {};
      let cur = new Date(from);
      const end = new Date(to);
      cur.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      while (cur <= end) {
        const id = toISO(cur);
        seeded[id] = {
          id,
          huntersBooked: 0,
          partyDeckBooked: false,
          isOffSeason: undefined,
        };
        cur.setDate(cur.getDate() + 1);
      }
      for (const r of rows) seeded[r.id] = r;
      setAvailability(
        Object.values(seeded).sort((a, b) => (a.id < b.id ? -1 : 1))
      );
    });
    return () => unsub();
  }, [fromIso, toIso, from, to]);

  // Today availability
  useEffect(() => {
    (async () => {
      const ref = doc(db, "availability", todayIso);
      const s = await getDoc(ref);
      setTodayAvail(s.exists() ? (s.data() as any) : null);
    })();
  }, [todayIso]);

  // Revenue + Merch orders (range-aware + search)
  useEffect(() => {
    const qRecent = query(
      collection(db, "orders"),
      orderBy("createdAt", "desc"),
      limit(500)
    );
    const unsub = onSnapshot(qRecent, (snap) => {
      const docs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as OrderDoc[];

      // Revenue KPIs in selected range (paid only)
      let r = 0;
      let c = 0;
      for (const o of docs) {
        if ((o.status ?? "pending") !== "paid") continue;
        const dt = o.createdAt?.toDate?.() as Date | undefined;
        if (!dt) continue;
        if (dt >= from && dt <= to) {
          c++;
          r += o.total ?? 0;
        }
      }
      setPaidCount(c);
      setPaidRevenue(r);

      // Merch orders in selected range (+ search)
      const term = merchSearch.trim().toLowerCase();
      const inRangeMerch = docs.filter((o) => {
        const hasMerch =
          !!o.merchItems && Object.keys(o.merchItems!).length > 0;
        if (!hasMerch) return false;
        const dt = o.createdAt?.toDate?.() as Date | undefined;
        return !!dt && dt >= from && dt <= to;
      });
      const filtered = term
        ? inRangeMerch.filter((o) => {
            const idHit = o.id.toLowerCase().includes(term);
            const name = `${o.customer?.firstName ?? ""} ${
              o.customer?.lastName ?? ""
            }`
              .trim()
              .toLowerCase();
            return idHit || name.includes(term);
          })
        : inRangeMerch;
      setMerchOrders(filtered.slice(0, 200));
    });
    return () => unsub();
  }, [from, to, merchSearch]);

  // Derived
  const huntersToday = todayAvail?.huntersBooked ?? 0;
  const partyDeckToday = todayAvail?.partyDeckBooked ?? false;
  const totalHuntersInRange = useMemo(
    () => availability.reduce((s, a) => s + (a.huntersBooked ?? 0), 0),
    [availability]
  );
  const totalDeckDays = useMemo(
    () => availability.filter((a) => a.partyDeckBooked).length,
    [availability]
  );
  const totalOffSeasonDays = useMemo(
    () => availability.filter((a) => a.isOffSeason).length,
    [availability]
  );

  return (
    <div className="min-h-screen text-[var(--color-text)] max-w-[1800px] mx-auto px-6 md:px-10 py-8 mt-30">
      {/* Header */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-4xl text-white font-acumin tracking-tight">
            Admin Dashboard
          </h1>
          <p className="opacity-70 mt-0 font-acumin">
            Availability-first overview of bookings, hunters, party deck, and
            merch.
          </p>
        </div>

        {/* Range controls */}
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "week", "month"] as RangeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={`px-3 py-2 rounded-xl border text-sm transition duration-300 ${
                range === k
                  ? "bg-[var(--color-accent-gold)] text-[var(--color-background)] hover:bg-emerald-300 border-white/10"
                  : "bg-neutral-400 text-[var(--color-background)] hover:bg-white border-white/10"
              }`}
            >
              {k === "today"
                ? "Today"
                : k === "week"
                ? "This Week"
                : "This Month"}
            </button>
          ))}
          <button
            onClick={() => setRange("custom")}
            className={`px-3 py-2 rounded-xl border text-sm transition duration-300 ${
              range === "custom"
                ? "bg-emerald-400 text-[var(--color-background)] hover:bg-emerald-300 border-white/10"
                : "bg-neutral-400 hover:bg-white text-[var(--color-background)] border-white/10"
            }`}
          >
            Custom
          </button>

          {range === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-2 rounded-lg bg-black/30 border border-white/10"
              />
              <span className="opacity-60">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-2 rounded-lg bg-black/30 border border-white/10"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl border border-white/10 bg-white/85 hover:bg-white transition shadow-lg p-5">
          <div className="text-2xl uppercase tracking-wide font-acumin font-bold text-[var(--color-background)]">
            Hunters Today
          </div>
          <div className="text-4xl font-semibold mt-1 text-[var(--color-background)]">
            <CountUp end={huntersToday} duration={0.7} separator="," />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/85 hover:bg-white transition shadow-lg p-5 text-[var(--color-background)]">
          <div className="text-2xl uppercase tracking-wide font-acumin font-bold">
            Party Deck Today
          </div>
          <div
            className={`text-3xl font-acumin mt-1 px-2 rounded-lg ${
              partyDeckToday ? "text-red-400" : "bg-emerald-400/60"
            }`}
          >
            {partyDeckToday ? "Reserved" : "Available"}
          </div>
          <div className="text-xs opacity-60 mt-1">
            {todayAvail?.isOffSeason ? "Regular Season" : "In-season"}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/85 hover:bg-white transition shadow-lg p-5 text-[var(--color-background)]">
          <div className="text-2xl uppercase tracking-wide font-acumin font-bold">
            Paid Orders
          </div>
          <div className="text-4xl font-semibold mt-1">
            <CountUp end={paidCount} duration={0.7} separator="," />
          </div>
          <div className="text-xs opacity-60 mt-1">
            From, {fromIso} → {toIso}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/85 hover:bg-white transition shadow-lg p-5 text-[var(--color-background)]">
          <div className="text-2xl uppercase tracking-wide font-acumin font-bold">
            Revenue
          </div>
          <div className="text-4xl font-semibold mt-1">
            <CountUp
              end={paidRevenue}
              duration={0.8}
              prefix="$"
              separator=","
            />
          </div>
          <div className="text-xs opacity-60 mt-1">
            From, {fromIso} → {toIso}
          </div>
        </div>
      </div>

      {/* Hunters per day table */}
      <div className="rounded-2xl border border-white/10 bg-white transition shadow-lg p-5 mb-8 text-[var(--color-background)]">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bourbon">Hunters by Day</h2>
          <span className="text-sm opacity-70">
            {fromIso} → {toIso}
          </span>
        </div>

        <div className="overflow-x-auto max-h-96 bg-white relative">
          <table className="w-full text-sm bg-white">
            <thead className="sticky top-0 z-20 py-2">
              <tr className="text-left opacity-70 border-b border-white/10">
                <th className="py-2 pr-4 px-2">Date</th>
                <th className="py-2 pr-4">Hunters</th>
                <th className="py-2 pr-4">Party Deck</th>
                <th className="py-2 pr-4">Season</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {availability.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center opacity-60">
                    No availability docs in this range.
                  </td>
                </tr>
              )}

              {availability.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-white/5 hover:shadow-md transition hover:bg-neutral-100"
                >
                  <td className="py-2 px-1 md:px-4">
                    <div className="font-medium">{friendlyDay(d.id)}</div>
                    <div className="opacity-60 text-xs font-mono">{d.id}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <CountUp end={d.huntersBooked ?? 0} duration={0.5} />
                  </td>
                  <td className="py-2 pr-4">
                    {d.partyDeckBooked ? "Reserved" : "Available"}
                  </td>
                  <td className="py-2 pr-4">
                    {d.isOffSeason ? "Regular Season" : "In-season"}
                  </td>
                  <td className="py-2 pr-0 text-right">
                    <Link
                      to={`/admin/day/${d.id}`}
                      className="inline-block px-3 py-1 rounded-lg border border-white/10 bg-white mr-2"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t border-white/10">
                <td className="py-2 pr-4 font-semibold">Totals</td>
                <td className="py-2 pr-4 font-semibold">
                  <CountUp end={totalHuntersInRange} duration={0.5} />
                </td>
                <td className="py-2 pr-4 font-semibold">
                  {totalDeckDays} day(s)
                </td>
                <td className="py-2 pr-4 font-semibold">
                  {totalOffSeasonDays} off‑season day(s)
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Merch Orders (searchable, range-aware) */}
      <div className="rounded-2xl border border-white/10 bg-white/90 hover:bg-white transition shadow-lg p-5 text-[var(--color-background)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bourbon">Merch Orders</h2>
          <input
            value={merchSearch}
            onChange={(e) => setMerchSearch(e.target.value)}
            placeholder="Search id or name…"
            className="px-3 py-2 rounded-lg bg-black/5 border border-black/10"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left opacity-70 border-b border-white/10">
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Items</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {merchOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center opacity-60">
                    No merch orders in this range.
                  </td>
                </tr>
              )}
              {merchOrders.map((o) => {
                const items = o.merchItems ? Object.values(o.merchItems) : [];
                const summary =
                  items.length === 0
                    ? "—"
                    : items
                        .slice(0, 3)
                        .map(
                          (it) =>
                            `${it.quantity ?? 0}× ${
                              it.name ?? it.sku ?? "Item"
                            }`
                        )
                        .join(", ") + (items.length > 3 ? "…" : "");
                const created =
                  o.createdAt?.toDate?.() instanceof Date
                    ? o.createdAt.toDate().toISOString().slice(0, 10)
                    : "—";
                const fullName =
                  `${o.customer?.firstName ?? ""} ${
                    o.customer?.lastName ?? ""
                  }`.trim() || "—";

                return (
                  <tr
                    key={o.id}
                    className="border-b border-white/5 hover:bg-neutral-100"
                  >
                    <td className="py-2 pr-4 font-mono">{o.id}</td>
                    <td className="py-2 pr-4">{fullName}</td>
                    <td className="py-2 pr-4 uppercase">{o.status ?? "—"}</td>
                    <td className="py-2 pr-4">{summary}</td>
                    <td className="py-2 pr-4">${(o.total ?? 0).toFixed(2)}</td>
                    <td className="py-2 pr-4">{created}</td>
                    <td className="py-2 pr-2 text-right">
                      <button
                        onClick={() => setSelectedMerch(o)}
                        className="inline-block px-3 py-1 rounded-lg border border-black/10 bg-white"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
