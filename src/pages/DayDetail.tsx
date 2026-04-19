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
/* =========================================================
 * PAGE
 * ======================================================= */

export default function DayDetail() {
  const { id } = useParams<{ id: string }>(); // YYYY-MM-DD
  const [avail, setAvail] = useState<AvailabilityDoc | null>(null);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [selected, setSelected] = useState<OrderDoc | null>(null);
  const [phoneMap, setPhoneMap] = useState<Record<string, string>>({});

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

          <Link
            to="/admin"
            className="inline-flex items-center justify-center  p-2 font-medium text-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold-hover)] shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition hover:brightness-105"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
      </div>
    </div>
  );
}
