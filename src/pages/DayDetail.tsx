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
  where,
  updateDoc,
} from "firebase/firestore";
import CountUp from "react-countup";
import { toast } from "react-toastify";
import { db } from "../firebase/firebaseConfig";

/* ---------- Types (compatible with your shapes) ---------- */
type AvailabilityDoc = {
  id: string; // "YYYY-MM-DD"
  huntersBooked: number;
  partyDeckBooked: boolean;
  isOffSeason?: boolean;
  timestamp?: any;
};

type Attendee = { fullName: string; email?: string; waiverSigned?: boolean };

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

  // permissive attendee inputs we’ve seen
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
  status?: "pending" | "paid" | "canceled" | "refunded";
  createdAt?: any;
  total?: number;
  customer?: { firstName?: string; lastName?: string; email?: string };
  booking?: Booking;
  merchItems?: Record<
    string,
    { name?: string; quantity?: number; price?: number; sku?: string }
  >;
};

/* ---------- Helpers ---------- */

// ISO "YYYY-MM-DD" → "Sept 6"
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

function currency(n = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
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

  // Ensure primary customer is present
  const customerName = `${order.customer?.firstName ?? ""} ${
    order.customer?.lastName ?? ""
  }`.trim();
  if (
    customerName &&
    !names.some((n) => n.toLowerCase() === customerName.toLowerCase())
  ) {
    names.unshift(customerName);
  }

  const partySize = b?.numberOfHunters ?? names.length;
  while (names.length < partySize) names.push(`Guest ${names.length + 1}`);

  // de-dupe
  const seen = new Set<string>();
  return names.filter((n) => {
    const key = n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ---------- Small inline modal component ---------- */

function OrderDetailsModal({
  order,
  dayId,
  onClose,
}: {
  order: OrderDoc;
  dayId: string;
  onClose: () => void;
}) {
  const names = extractPartyNames(order);
  const structured = toAttendeeObjects(order) ?? [];
  const [rows, setRows] = useState<Attendee[]>(structured);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  // keep in sync if Firestore pushes an update
  useEffect(() => {
    setRows(structured);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, structured.length, JSON.stringify(structured)]);

  const deckAny = (order.booking?.partyDeckDates ?? []).length > 0;
  const deckToday = (order.booking?.partyDeckDates ?? []).includes(dayId);

  const customerName =
    `${order.customer?.firstName ?? ""} ${
      order.customer?.lastName ?? ""
    }`.trim() || "Customer";

  return (
    <div className="fixed inset-0 z-40 flex items-start md:items-center justify-center p-4 md:p-8">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 w-full max-w-5xl rounded-2xl bg-white text-[var(--color-background)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black/10">
          <div>
            <div className="text-2xl font-gin">Order Details</div>
            <div className="text-xs opacity-70 font-mono mt-1">
              {order.id}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(order.id);
                  toast.info("Order ID copied.");
                }}
                className="ml-2 px-2 py-0.5 border rounded-md text-[10px]"
              >
                Copy ID
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10"
          >
            Close
          </button>
        </div>

        {/* Top summary cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-60 mb-1">Customer</div>
            <div className="font-semibold">{customerName}</div>
            {order.customer?.email && (
              <div className="text-sm opacity-80">{order.customer.email}</div>
            )}
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-60 mb-1">Totals</div>
            <div className="font-semibold">{currency(order.total ?? 0)}</div>
            <div className="text-xs mt-1">
              STATUS:&nbsp;
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                {order.status?.toUpperCase() ?? "PAID"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-60 mb-1">All Dates</div>
            <div className="font-semibold">
              {(order.booking?.dates ?? []).map(friendlyDay).join(", ") || "—"}
            </div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-60 mb-1">Party Deck</div>
            <div className="font-semibold">
              {deckAny ? (deckToday ? "Yes (today)" : "Yes") : "No"}
            </div>
          </div>
        </div>

        {/* Attendees & Waivers */}
        <div className="p-4 border-t border-black/10">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bourbon text-lg">Attendees & Waivers</div>

            {rows.length === 0 && names.length > 0 && (
              <button
                onClick={() => initializeAttendees(order, names)}
                className="text-xs px-3 py-1.5 rounded-lg border hover:bg-black/5"
              >
                Initialize for waivers
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="text-sm opacity-70">
              No structured attendee records yet. Click “Initialize for waivers”
              to create them from the party list.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-black/10">
                    <th className="py-2 pr-3 w-10">#</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3 w-40">Waiver</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a, idx) => (
                    <tr
                      key={`${order.id}-att-${idx}`}
                      className="border-b border-black/5"
                    >
                      <td className="py-2 pr-3">{idx + 1}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.fullName}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              a.waiverSigned
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-neutral-200 text-neutral-700"
                            }`}
                          >
                            {a.waiverSigned ? "Signed" : "Pending"}
                          </span>
                          {idx === 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5">
                              Lead
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3">{a.email ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="accent-[var(--color-accent-gold)]"
                            disabled={savingIdx === idx}
                            checked={!!a.waiverSigned}
                            onChange={async (e) => {
                              const next = e.currentTarget.checked;
                              try {
                                setSavingIdx(idx);
                                // optimistic UI
                                setRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, waiverSigned: next } : r
                                  )
                                );
                                await toggleWaiver(order.id, idx, next);
                                toast[next ? "success" : "info"](
                                  next
                                    ? `Waiver marked signed for ${a.fullName}.`
                                    : `Waiver marked NOT signed for ${a.fullName}.`
                                );
                              } catch (err) {
                                // revert on failure
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
                          <span>
                            {a.waiverSigned ? "Signed" : "Mark signed"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
 *                           PAGE
 * =======================================================*/
export default function DayDetail() {
  const { id } = useParams<{ id: string }>(); // YYYY-MM-DD
  const [avail, setAvail] = useState<AvailabilityDoc | null>(null);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [selected, setSelected] = useState<OrderDoc | null>(null);

  const nice = useMemo(() => (id ? friendlyDay(id) : ""), [id]);

  // availability/{id}
  useEffect(() => {
    if (!id) return;
    (async () => {
      const s = await getDoc(doc(db, "availability", id));
      setAvail(s.exists() ? (s.data() as any) : null);
    })();
  }, [id]);

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
      setOrders(docs.filter((o) => (o.status ?? "pending") === "paid"));
    });
    return () => unsub();
  }, [id]);

  // Derived
  const totalHuntersFromOrders = useMemo(
    () => orders.reduce((sum, o) => sum + (o.booking?.numberOfHunters ?? 0), 0),
    [orders]
  );

  const allNames = useMemo(() => {
    const bag: string[] = [];
    for (const o of orders) extractPartyNames(o).forEach((n) => bag.push(n));
    const seen = new Set<string>();
    return bag.filter((n) => {
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [orders]);

  return (
    <div className="min-h-screen text-[var(--color-text)] px-6 md:px-10 py-8 mt-40 max-w-[1400px] mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl font-acumin tracking-tight text-white">
          {nice} — Day Overview
        </h1>
        <Link
          to="/admin"
          className="px-3 py-2 rounded-xl border border-white/10 bg-[var(--color-accent-gold)] text-[var(--color-background)] font-acumin"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl bg-gradient-to-t from-white to-neutral-100 shadow-lg">
          <div className="mb-5 rounded-t-2xl text-xl p-1 text-center lowercase tracking-wide font-acumin text-[var(--color-background)] bg-white">
            current hunters booked
          </div>
          <div className="px-4">
            <div className="px-2 text-3xl font-semibold text-[var(--color-background)]">
              <CountUp end={avail?.huntersBooked ?? 0} duration={0.6} />
            </div>
            <div
              className={`mt-2 text-sm text-[var(--color-background)] max-w-[220px] p-1 rounded-md ${
                avail?.partyDeckBooked ? "text-red-400" : "bg-emerald-400/50"
              }`}
            >
              Party Deck: {avail?.partyDeckBooked ? "Reserved" : "Available"}
            </div>
            <div className="mt-1 text-sm text-[var(--color-background)]/60 mb-3">
              {avail?.isOffSeason ? "Regular Season" : "In-season"}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-t from-white to-white shadow-lg">
          <div className="mb-5 rounded-t-2xl text-xl p-1 text-center lowercase tracking-wide font-acumin text-[var(--color-background)] bg-white">
            from paid orders
          </div>
          <div className="px-4">
            <div className="text-lg text-[var(--color-background)]">
              Hunters
            </div>
            <div className="text-3xl font-semibold text-[var(--color-background)]">
              <CountUp end={totalHuntersFromOrders} duration={0.6} />
            </div>
            <div className="mt-2 text-lg text-[var(--color-background)]">
              Orders: <CountUp end={orders.length} duration={0.6} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border-white border-2 bg-white/85 shadow-lg p-5">
          <div className="text-lg text-[var(--color-background)]">
            Attendees (All)
          </div>
          <div className="mt-2">
            <div className="text-lg text-[var(--color-background)]">
              Unique Names
            </div>
            <div className="text-3xl font-semibold text-[var(--color-background)]">
              <CountUp end={allNames.length} duration={0.6} />
            </div>
          </div>
        </div>
      </div>

      {/* Paid orders — now in a table */}
      <div className="rounded-2xl border mb-8 border-white/10 bg-white shadow-lg p-2">
        <h2 className="text-xl p-2 text-center lowercase tracking-wide font-acumin text-[var(--color-background)] bg-white rounded-t-2xl">
          Paid orders for {nice}
        </h2>

        {orders.length === 0 ? (
          <div className="text-lg text-[var(--color-background)] p-10 flex items-center justify-center">
            No paid orders for this day.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-[var(--color-background)]">
              <thead>
                <tr className="text-left opacity-70 border-b border-black/10">
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Hunters</th>
                  <th className="py-2 pr-4">Party Deck Today</th>
                  <th className="py-2 pr-4">All Dates</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-2 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const fullName =
                    `${o.customer?.firstName ?? ""} ${
                      o.customer?.lastName ?? ""
                    }`.trim() || "—";
                  const b = o.booking;
                  const hunters = b?.numberOfHunters ?? 0;
                  const deckToday = (b?.partyDeckDates ?? []).includes(id!)
                    ? "Yes"
                    : "No";
                  const dates = b?.dates?.map(friendlyDay).join(", ") ?? "—";
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-black/5 hover:bg-neutral-100"
                    >
                      <td className="py-2 pr-4 font-mono">
                        {o.id.slice(0, 10)}…
                      </td>
                      <td className="py-2 pr-4">{fullName}</td>
                      <td className="py-2 pr-4">
                        <CountUp end={Number(hunters) || 0} duration={0.5} />
                      </td>
                      <td className="py-2 pr-4">{deckToday}</td>
                      <td className="py-2 pr-4">{dates}</td>
                      <td className="py-2 pr-4">{currency(o.total ?? 0)}</td>
                      <td className="py-2 pr-2 text-right">
                        <button
                          onClick={() => setSelected(o)}
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
        )}
      </div>

      {selected && id && (
        <OrderDetailsModal
          order={selected}
          dayId={id}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
