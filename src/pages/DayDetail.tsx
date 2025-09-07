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
} from "firebase/firestore";
import CountUp from "react-countup";
import { db } from "../firebase/firebaseConfig";

// -------- Types (aligns with your posted shapes) --------
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
  // Optional attendee-like fields (support multiple shapes gracefully)
  attendees?: Array<
    | { name?: string; firstName?: string; lastName?: string; email?: string }
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

// -------- Helpers --------

// ISO "YYYY-MM-DD" → "Sept 6"
function friendlyDay(iso: string) {
  const [, m, d] = iso.split("-").map(Number); // skip year
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
        // common keys
        const n =
          itm.name ??
          [itm.firstName, itm.lastName].filter(Boolean).join(" ") ??
          itm.fullName ??
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

  // Ensure primary customer is represented
  const customerName = `${order.customer?.firstName ?? ""} ${
    order.customer?.lastName ?? ""
  }`.trim();
  if (
    customerName &&
    !names.some((n) => n.toLowerCase() === customerName.toLowerCase())
  ) {
    names.unshift(customerName);
  }

  // If we still don't have enough names, fill with placeholders up to numberOfHunters
  const partySize = b?.numberOfHunters ?? names.length;

  while (names.length < partySize) {
    names.push(`Guest ${names.length + 1}`);
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  return names.filter((n) => {
    const key = n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function DayDetail() {
  const { id } = useParams<{ id: string }>(); // YYYY-MM-DD
  const [avail, setAvail] = useState<AvailabilityDoc | null>(null);
  const [orders, setOrders] = useState<OrderDoc[]>([]);

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
    for (const o of orders) {
      const ns = extractPartyNames(o);
      for (const n of ns) bag.push(n);
    }
    // dedupe
    const seen = new Set<string>();
    return bag.filter((n) => {
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [orders]);

  return (
    <div className="min-h-screen text-[var(--color-text)] px-6 md:px-10 py-8 mt-20">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl font-bourbon tracking-tight">
          {nice} — Day Overview
        </h1>
        <Link
          to="/admin"
          className="px-3 py-2 rounded-xl border border-white/10 bg-[var(--color-card)] hover:bg-black/30"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl border border-white/10 bg-[var(--color-card)]/95 shadow p-5">
          <div className="text-sm uppercase opacity-70 font-bourbon">
            From Availability
          </div>
          <div className="mt-2">
            <div className="text-lg">Hunters Booked</div>
            <div className="text-3xl font-semibold">
              <CountUp end={avail?.huntersBooked ?? 0} duration={0.6} />
            </div>
            <div className="mt-2 text-sm opacity-70">
              Party Deck: {avail?.partyDeckBooked ? "Reserved" : "Available"}
            </div>
            <div className="mt-1 text-sm opacity-70">
              {avail?.isOffSeason ? "Off-season" : "In-season"}
            </div>
            <div className="mt-1 text-xs opacity-60">
              {avail?.timestamp?.toDate
                ? avail.timestamp.toDate().toLocaleString()
                : "—"}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[var(--color-card)]/95 shadow p-5">
          <div className="text-sm uppercase opacity-70 font-bourbon">
            From Orders (Paid)
          </div>
          <div className="mt-2">
            <div className="text-lg">
              Hunters (sum of booking.numberOfHunters)
            </div>
            <div className="text-3xl font-semibold">
              <CountUp end={totalHuntersFromOrders} duration={0.6} />
            </div>
            <div className="mt-2 text-sm opacity-70">
              Orders: <CountUp end={orders.length} duration={0.6} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[var(--color-card)]/95 shadow p-5">
          <div className="text-sm uppercase opacity-70 font-bourbon">
            Attendees (All)
          </div>
          <div className="mt-2">
            <div className="text-lg">Unique Names</div>
            <div className="text-3xl font-semibold">
              <CountUp end={allNames.length} duration={0.6} />
            </div>
            <div className="mt-2 text-sm opacity-70">
              Includes customers + party members (deduped)
            </div>
          </div>
        </div>
      </div>

      {/* Orders with party lists */}
      <div className="rounded-2xl border border-white/10 bg-[var(--color-card)]/95 shadow p-5 mb-8">
        <h2 className="text-2xl font-bourbon mb-4">Paid Orders for {nice}</h2>

        {orders.length === 0 ? (
          <div className="py-10 text-center opacity-60">
            No paid orders for this day.
          </div>
        ) : (
          <ul className="space-y-4">
            {orders.map((o) => {
              const b = o.booking;
              const party = extractPartyNames(o);
              const partySize = b?.numberOfHunters ?? party.length;
              const deckToday = (b?.partyDeckDates ?? []).includes(id!)
                ? "Yes"
                : "No";
              const customerName =
                `${o.customer?.firstName ?? ""} ${
                  o.customer?.lastName ?? ""
                }`.trim() || "Customer";

              return (
                <li
                  key={o.id}
                  className="rounded-xl border border-white/10 bg-black/20"
                >
                  <details>
                    <summary className="cursor-pointer list-none p-4 flex flex-col gap-1">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 font-mono">
                            {o.id}
                          </span>
                          <span className="font-medium">{customerName}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm">
                            Party size:{" "}
                            <strong>
                              <CountUp end={partySize} duration={0.5} />
                            </strong>
                          </span>
                          <span className="text-sm">
                            Party Deck (this day): <strong>{deckToday}</strong>
                          </span>
                          <span className="text-sm">
                            Total:{" "}
                            <strong>
                              <CountUp
                                end={o.total ?? 0}
                                prefix="$"
                                separator=","
                                duration={0.6}
                              />
                            </strong>
                          </span>
                        </div>
                      </div>
                      <div className="opacity-60 text-xs mt-1">
                        All Dates: {b?.dates?.join(", ") || "—"}
                      </div>
                    </summary>

                    {/* Party list */}
                    <div className="px-4 pb-4">
                      <div className="text-sm uppercase opacity-70 mb-2">
                        Party Members
                      </div>
                      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {party.map((name, idx) => (
                          <li
                            key={`${o.id}-member-${idx}`}
                            className="rounded-lg border border-white/10 bg-[var(--color-card)]/80 px-3 py-2"
                          >
                            {idx === 0 ? (
                              <span className="opacity-80">Lead: </span>
                            ) : null}
                            <span className="font-medium">{name}</span>
                          </li>
                        ))}
                      </ol>

                      {/* If there are more seats than names we already filled with placeholders in extractPartyNames() */}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* All attendees for the day */}
      <div className="rounded-2xl border border-white/10 bg-[var(--color-card)]/95 shadow p-5">
        <h2 className="text-2xl font-bourbon mb-3">All Attendees — {nice}</h2>
        {allNames.length === 0 ? (
          <div className="py-6 opacity-60">No attendees found.</div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {allNames.map((n, i) => (
              <li
                key={`attendee-${i}`}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              >
                {n}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
