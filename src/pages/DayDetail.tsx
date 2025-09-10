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
    <div className="min-h-screen text-[var(--color-text)] px-6 md:px-10 py-8 mt-20 max-w-[1400px] mx-auto">
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
        <div className="rounded-2xl  bg-white/85 hover:bg-white transition duration-300 ease-in-out shadow-lg group">
          <div className="mb-5 rounded-t-2xl text-xl p-1 text-center lowercase tracking-wide font-acumin   text-[var(--color-background)] bg-white group-hover:bg-emerald-400/50 transition duration-800 ease-in-out">
            current hunters Booked
          </div>
          <div className="flex items-center justify-start px-4">
            <div>
              <div className=" px-2 text-3xl font-semibold  lowercase tracking-wide text-[var(--color-background)]">
                <CountUp end={avail?.huntersBooked ?? 0} duration={0.6} />
              </div>
              <div
                className={`mt-2 text-sm text-[var(--color-background)] max-w-[200px] p-1 rounded-md ${
                  avail?.partyDeckBooked ? "text-red-400" : "bg-emerald-400"
                }`}
              >
                Party Deck: {avail?.partyDeckBooked ? "Reserved" : "Available"}
              </div>
              <div className="mt-2 text-sm text-[var(--color-background)]">
                {avail?.isOffSeason ? "Off-season" : "In-season"}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border-white border-2 bg-white/85 hover:bg-white transition duration-300 ease-in-out shadow-lg p-5">
          <div className="text-2xl lowercase tracking-wide font-acumin   text-[var(--color-background)]">
            From paid orders
          </div>
          <div>
            <div className="text-lg text-[var(--color-background)]">
              Hunters
            </div>
            <div className="text-3xl font-semibold  lowercase tracking-wide text-[var(--color-background)]">
              <CountUp end={totalHuntersFromOrders} duration={0.6} />
            </div>
            <div className="mt-2 text-lg text-[var(--color-background)]">
              Orders: <CountUp end={orders.length} duration={0.6} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border-white border-2 bg-white/85 hover:bg-white transition duration-300 ease-in-out shadow-lg p-5">
          <div className="text-lg text-[var(--color-background)]">
            Attendees (All)
          </div>
          <div className="mt-2">
            <div className="text-lg text-[var(--color-background)]">
              Unique Names
            </div>
            <div className="text-3xl font-semibold  lowercase tracking-wide text-[var(--color-background)]">
              <CountUp end={allNames.length} duration={0.6} />
            </div>
          </div>
        </div>
      </div>

      {/* Paid orders — redesigned */}
      <div className="rounded-2xl border mb-8 border-white/10 bg-white/90 hover:bg-white transition duration-300 ease-in-out shadow-lg">
        <h2 className="text-xl p-2 text-center lowercase tracking-wide font-acumin text-[var(--color-background)] bg-white/95 rounded-t-2xl">
          Paid orders for {nice}
        </h2>

        {orders.length === 0 ? (
          <div className="text-lg text-[var(--color-background)] p-10 flex items-center justify-center">
            No paid orders for this day.
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {orders.map((o) => {
              const b = o.booking;
              const party = extractPartyNames(o);
              const partySize = b?.numberOfHunters ?? party.length;
              const deckToday = (b?.partyDeckDates ?? []).includes(id!);
              const customerName =
                `${o.customer?.firstName ?? ""} ${
                  o.customer?.lastName ?? ""
                }`.trim() || "Customer";
              const shortId = o.id.slice(0, 8);
              const total = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(o.total ?? 0);

              return (
                <li key={o.id} className="p-4">
                  {/* Header row */}
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-black/10 border border-white/10 font-mono text-xs text-[var(--color-background)]">
                        #{shortId}
                        <button
                          title="Copy full ID"
                          onClick={() => navigator.clipboard.writeText(o.id)}
                          className="ml-1 px-1.5 py-0.5 rounded bg-white/60 hover:bg-white text-[var(--color-background)]"
                        >
                          copy
                        </button>
                      </span>
                      <div className="font-medium text-[var(--color-background)]">
                        {customerName}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        Paid
                      </span>
                      <span className="text-lg font-semibold text-[var(--color-background)]">
                        {total}
                      </span>
                    </div>
                  </div>

                  {/* Meta chips */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-black/10 text-[var(--color-background)]">
                      Party size: <strong className="ml-1">{partySize}</strong>
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-md text-xs ${
                        deckToday
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      Party Deck: {deckToday ? "Yes" : "No"}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-black/10 text-[var(--color-background)]">
                      Orders today: 1
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-black/10 text-[var(--color-background)]">
                      All dates:&nbsp;
                      {(b?.dates ?? []).length
                        ? b!.dates!.map((d) => friendlyDay(d)).join(", ")
                        : "—"}
                    </span>
                  </div>

                  {/* Attendees */}
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="text-xs uppercase opacity-60 mb-2">
                      Attendees
                    </div>
                    <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {party.map((name, idx) => (
                        <li
                          key={`${o.id}-member-${idx}`}
                          className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-[var(--color-background)]"
                        >
                          {idx === 0 ? (
                            <span className="opacity-70 mr-1">Lead:</span>
                          ) : null}
                          <span className="font-medium">{name}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
