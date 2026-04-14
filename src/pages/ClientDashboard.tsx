// /pages/ClientDashboard.tsx — compact UI + Cancel/Refund confirm modal
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
  increment,
  deleteDoc,
} from "firebase/firestore";
import { useCart } from "../context/CartContext";
import { useNavigate, useLocation } from "react-router-dom";
import type { Order } from "../types/Types";
import { toast } from "react-toastify";

/**
 * NOTE:
 * - This preserves your logic, strengthens UI/UX, and adds a confirm modal before cancellations.
 * - Hooks remain in a fixed order on every render to avoid “invalid hook call / #310” issues.
 */

/** Format money safely. */
function fmtMoney(n: unknown): string {
  const num = typeof n === "number" ? n : Number(n);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

// Deep-search helper to find first matching ID key in a nested object
function findDeepId(obj: any, re: RegExp): string | null {
  const seen = new Set<any>();
  const stack: any[] = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, v] of Object.entries(cur)) {
      if (re.test(String(k)) && typeof v === "string" && v.trim()) {
        return v.trim();
      }
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}
// ---- Order filters & classification ----

// Earliest hunt date (if any)
function firstHuntDate(order: Order): string | undefined {
  const d = order?.booking?.dates;
  if (!Array.isArray(d) || d.length === 0) return undefined;
  return [...d].sort()[0]; // YYYY-MM-DD sorts safely
}

// midnight-local comparison helpers
function isPast(iso?: string) {
  if (!iso) return false;
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    t.setHours(0, 0, 0, 0);
    return t.getTime() < today.getTime();
  } catch {
    return false;
  }
}

// UX stage for the pill beside status (purely visual)
type Stage = "active" | "completed" | "pending" | "cancelled" | "refunded";
function classifyStage(order: Order): Stage {
  if (order.status === "refunded") return "refunded";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "pending") return "pending";
  const first = firstHuntDate(order);
  if (!first) return "completed";
  return isPast(first) ? "completed" : "active";
}

/** "Friday, October 4th, 2025" (safe) */
function formatFriendlyDateSafe(iso?: unknown): string {
  if (typeof iso !== "string" || !/\d{4}-\d{2}-\d{2}/.test(iso))
    return "Unknown date";
  try {
    const [yyyy, mm, dd] = iso.split("-").map((s) => Number(s));
    const d = new Date(yyyy, mm - 1, dd);
    const weekday = d.toLocaleString("en-US", { weekday: "long" });
    const month = d.toLocaleString("en-US", { month: "long" });
    const day = d.getDate();
    const j = day % 10,
      k = day % 100;
    const suffix =
      j === 1 && k !== 11
        ? "st"
        : j === 2 && k !== 12
        ? "nd"
        : j === 3 && k !== 13
        ? "rd"
        : "th";
    return `${weekday}, ${month} ${day}${suffix}, ${d.getFullYear()}`;
  } catch {
    return String(iso);
  }
}
// Add this helper near your other helpers in ClientDashboard.tsx
function formatCreatedAt(createdAt: any): string {
  try {
    const ms =
      typeof createdAt === "number"
        ? createdAt * 1000
        : createdAt?.seconds
        ? createdAt.seconds * 1000
        : null;
    if (!ms) return "";
    const d = new Date(ms);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function formatDateRange(dates?: string[]): string {
  if (!Array.isArray(dates) || dates.length === 0) return "No hunt dates";
  const sorted = [...dates].sort();
  if (sorted.length === 1) return formatFriendlyDateSafe(sorted[0]);
  return `${formatFriendlyDateSafe(sorted[0])} – ${formatFriendlyDateSafe(
    sorted[sorted.length - 1]
  )}`;
}

function getCustomerName(order: Order): string {
  const first = order.customer?.firstName?.trim() || "";
  const last = order.customer?.lastName?.trim() || "";
  const full = `${first} ${last}`.trim();
  if (full) return full;

  const fallbackName = (order.booking as any)?.name;
  if (typeof fallbackName === "string" && fallbackName.trim()) {
    return fallbackName.trim();
  }

  return "Guest";
}

function getCustomerEmail(order: Order): string {
  return (
    order.customer?.email || (order.booking as any)?.email || "No email on file"
  );
}

function getCustomerPhone(order: Order): string {
  return (
    order.customer?.phone || (order.booking as any)?.phone || "No phone on file"
  );
}

/** Normalize merch lines (supports object map or legacy array shapes). */
function normalizeMerchItems(merch: Order["merchItems"]) {
  if (!merch)
    return [] as Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
    }>;
  if (Array.isArray(merch)) {
    return (merch as any[]).map((item, idx) => ({
      id: String(idx),
      name: item?.product?.name ?? item?.name ?? "Item",
      price:
        typeof item?.product?.price === "number"
          ? item.product.price
          : typeof item?.price === "number"
          ? item.price
          : Number(item?.price) || 0,
      quantity:
        typeof item?.quantity === "number"
          ? item.quantity
          : Number(item?.quantity) || 0,
    }));
  }
  return Object.entries(merch as Record<string, any>).map(([id, item]) => ({
    id,
    name: item?.product?.name ?? item?.name ?? "Item",
    price:
      typeof item?.product?.price === "number"
        ? item.product.price
        : typeof item?.price === "number"
        ? item.price
        : Number(item?.price) || 0,
    quantity:
      typeof item?.quantity === "number"
        ? item.quantity
        : Number(item?.quantity) || 0,
  }));
}

/** Days until a YYYY-MM-DD date (rounded). Negative = in the past. */
function daysUntil(iso: string) {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    const today = new Date();
    const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const b = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate()
    );
    return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  } catch {
    return 0;
  }
}

/** Lightweight error boundary */
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("ClientDashboard error:", error);
    toast.error("Something went wrong rendering your dashboard.");
  }
  render() {
    if (this.state.error) {
      return (
        <div className="max-w-3xl mx-auto text-center text-red-300 bg-red-900/10 border border-red-700 rounded-md p-6 mt-24">
          <h2 className="text-xl font-semibold">We hit a snag</h2>
          <p className="text-sm mt-2">
            Try reloading the page. If it continues, please contact support.
          </p>
        </div>
      );
    }
    return this.props.children as any;
  }
}

type Tab = "orders" | "cart";

type CancelPreview = {
  order: Order;
  hasBooking: boolean;
  firstDate?: string;
  eligibleForRefund: boolean;
  previewRefundAmount: number;
};

const ClientDashboard: React.FC = () => {
  // ---------------- Hooks (fixed order) ----------------
  const { user, checkAndCreateUser } = useAuth();
  const { isHydrated, booking, merchItems } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [loadingSuccess, setLoadingSuccess] = useState(false);
  type OrdersTab = "all" | "upcoming" | "past" | "cancelled";
  const [ordersTab, setOrdersTab] = useState<OrdersTab>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<CancelPreview | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const status = params.get("status"); // 'pending' | 'paid' | null
  const orderIdParam = params.get("orderId");

  // Gentle nudge when back from checkout with a pending order
  useEffect(() => {
    if (status === "pending") toast("You have an order waiting for payment.");
  }, [status]);

  // If redirected with ?status=paid&orderId=..., load the order for success panel
  useEffect(() => {
    let abort = false;

    // Reset success state when URL is not the paid-success case
    if (status !== "paid" || !orderIdParam || !user?.uid) {
      setShowSuccess(false);
      setSuccessOrder(null);
      setLoadingSuccess(false);
      return () => {
        abort = true;
      };
    }

    (async () => {
      try {
        setLoadingSuccess(true);
        setShowSuccess(true);

        const snap = await getDoc(doc(db, "orders", orderIdParam));

        if (abort) return;

        if (!snap.exists()) {
          setSuccessOrder(null);
          toast.error("Order not found.");
          return;
        }

        const data = snap.data() as Order;
        const fetchedOrder: Order = { id: snap.id, ...data };

        // Extra client-side safety check so we only render the current user's order
        if (fetchedOrder.userId !== user.uid) {
          setSuccessOrder(null);
          setShowSuccess(false);
          toast.error("You do not have access to this order.");
          navigate("/dashboard", { replace: true });
          return;
        }

        setSuccessOrder(fetchedOrder);
      } catch (err) {
        console.error("Failed to load order", err);
        if (!abort) {
          setSuccessOrder(null);
          toast.error("Failed to load order details.");
        }
      } finally {
        if (!abort) setLoadingSuccess(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [status, orderIdParam, user?.uid, navigate]);

  // Load this user's orders
  useEffect(() => {
    let abort = false;
    (async () => {
      if (!user) {
        setOrders([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const q = query(
          collection(db, "orders"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        if (abort) return;
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Order),
        }));
        setOrders(list);
      } catch (err) {
        console.warn("Primary orders query failed; falling back.", err);
        try {
          const q2 = query(
            collection(db, "orders"),
            where("userId", "==", user.uid)
          );
          const snap2 = await getDocs(q2);
          if (abort) return;
          const list2 = snap2.docs
            .map((d) => ({ id: d.id, ...(d.data() as Order) }))
            .sort(
              (a: any, b: any) =>
                (b?.createdAt?.seconds ?? 0) - (a?.createdAt?.seconds ?? 0)
            );
          setOrders(list2);
        } catch (err2) {
          console.error("Fallback orders query failed.", err2);
          setOrders([]);
          toast.error("Could not load your orders.");
        }
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [user]);

  // Derived: whether cart has anything
  const hasCartItems = useMemo(() => {
    if (!isHydrated) return false;
    const hasBooking = Boolean(booking);
    const merchCount = Array.isArray(merchItems)
      ? (merchItems as any[]).length
      : merchItems && typeof merchItems === "object"
      ? Object.keys(merchItems).length
      : 0;
    return hasBooking || merchCount > 0;
  }, [isHydrated, booking, merchItems]);
  const validOrders = useMemo(
    () =>
      orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded"),
    [orders]
  );
  const cancelledOrders = useMemo(
    () =>
      orders.filter((o) => o.status === "cancelled" || o.status === "refunded"),
    [orders]
  );

  const upcomingOrders = useMemo(
    () =>
      validOrders.filter((o) => {
        const stage = classifyStage(o);
        return stage === "active" || stage === "pending";
      }),
    [validOrders]
  );

  const pastOrders = useMemo(
    () => validOrders.filter((o) => classifyStage(o) === "completed"),
    [validOrders]
  );

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "pending"),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    if (ordersTab === "cancelled") return cancelledOrders;
    if (ordersTab === "upcoming") return upcomingOrders;
    if (ordersTab === "past") return pastOrders;
    return orders;
  }, [orders, cancelledOrders, upcomingOrders, pastOrders, ordersTab]);

  // ---------------- Cancel + Refund (unchanged logic; now triggered from modal) ----------------
  const handleCancelOrder = async (order: Order) => {
    try {
      if (!order?.id) return;
      if (order.status === "cancelled") {
        toast.info("Order already cancelled.");
        return;
      }

      const isPaid = order.status === "paid";
      const hasBooking = Boolean(order?.booking?.dates?.length);
      const firstDate = hasBooking ? order!.booking!.dates![0] : undefined;
      const dUntil = firstDate ? daysUntil(firstDate) : 0;
      const eligibleForRefund = hasBooking && isPaid && dUntil >= 14; // merch-only => false
      const totalNum =
        typeof order.total === "number"
          ? order.total
          : Number(order.total) || 0;
      const refundAmount = eligibleForRefund
        ? Math.round(totalNum * 0.5 * 100) / 100
        : 0;

      // 1) Attempt Deluxe refund if eligible
      let refundPayload: any = null;
      if (refundAmount > 0) {
        const paymentId = findDeepId(order.deluxe, /\bpaymentId\b/i) || null;
        const originalTransactionId =
          findDeepId(order.deluxe, /\boriginalTransactionId\b/i) ||
          findDeepId(order.deluxe, /\btransactionId\b/i) ||
          null;

        const body: Record<string, any> = {
          orderId: order.id,
          amount: Number(refundAmount.toFixed(2)),
          currency: ((order as any)?.currency || "USD").toUpperCase(),
        };
        if (paymentId) body.paymentId = paymentId;
        else if (originalTransactionId)
          body.originalTransactionId = originalTransactionId;

        try {
          const r = await fetch("/api/refundDeluxePayment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          refundPayload = await r.json().catch(() => null);

          if (r.ok) {
            toast.success(`Refund initiated for $${fmtMoney(refundAmount)}`);
            if (refundPayload?.resolvedPaymentId) {
              console.log(
                "Refund resolvedPaymentId:",
                refundPayload.resolvedPaymentId
              );
            }
          } else {
            console.warn("Refund failed:", refundPayload);
            toast.error("Refund request failed; cancelling without refund.");
          }
        } catch (e) {
          console.error("Refund network error", e);
          toast.error(
            "Could not reach refund service; cancelling without refund."
          );
        }
      }
      // Decide status based on server response
      const approved =
        !!refundPayload &&
        (refundPayload.approved === true ||
          String(
            refundPayload?.responseCode ?? refundPayload?.code ?? ""
          ).toLowerCase() === "0" ||
          /approved|success/i.test(
            String(
              refundPayload?.status ?? refundPayload?.responseMessage ?? ""
            )
          ));
      const refundSucceeded = refundAmount > 0 && approved;
      const nextStatus: Order["status"] = refundSucceeded
        ? "refunded"
        : "cancelled";

      // 2) Firestore updates (cancel order, free capacity)
      const batch = writeBatch(db);
      const orderRef = doc(db, "orders", order.id!);
      batch.set(
        orderRef,
        {
          status: nextStatus,
          refundAmount,
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...(refundPayload
            ? { deluxe: { ...(order as any).deluxe, refund: refundPayload } }
            : {}),
        },
        { merge: true }
      );

      // Free booked hunt capacity (if any)
      const nHunters = Number(order?.booking?.numberOfHunters || 0);
      if (hasBooking && nHunters > 0) {
        for (const date of order!.booking!.dates!) {
          const availRef = doc(db, "availability", date);
          batch.set(
            availRef,
            { huntersBooked: increment(-nHunters) },
            { merge: true }
          );
          if ((order as any)?.booking?.partyDeckDates?.includes?.(date)) {
            batch.set(availRef, { partyDeckBooked: false }, { merge: true });
          }
        }
      }

      await batch.commit();

      // UI optimistic update
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? ({ ...o, status: nextStatus, refundAmount } as any)
            : o
        )
      );
    } catch (err) {
      console.error(err);
      toast.error("Could not cancel this order.");
    }
  };

  const handleSuccessDismiss = () => {
    setShowSuccess(false);
    setSuccessOrder(null);
    setLoadingSuccess(false);
    setActiveTab("orders");
    navigate("/dashboard", { replace: true });
  };

  // ---------------- UI helpers ----------------
  function computeCancelPreview(order: Order): CancelPreview {
    const hasBooking = Boolean(order?.booking?.dates?.length);
    const firstDate = hasBooking ? order.booking!.dates![0] : undefined;
    const isPaid = order.status === "paid";
    const dUntil = firstDate ? daysUntil(firstDate) : 0;

    const totalNum =
      typeof order.total === "number" ? order.total : Number(order.total) || 0;
    const eligibleForRefund = hasBooking && isPaid && dUntil >= 14;
    const previewRefundAmount = eligibleForRefund
      ? Math.round(totalNum * 0.5 * 100) / 100
      : 0;

    return {
      order,
      hasBooking,
      firstDate,
      eligibleForRefund,
      previewRefundAmount,
    };
  }

  function openCancelConfirm(order: Order) {
    setConfirmData(computeCancelPreview(order));
    setConfirmOpen(true);
  }

  function closeCancelConfirm() {
    setConfirmOpen(false);
    setConfirmData(null);
  }
  function openDeleteConfirm(order: Order) {
    setDeleteTarget(order);
    setDeleteOpen(true);
  }

  function closeDeleteConfirm() {
    setDeleteOpen(false);
    setDeleteTarget(null);
  }

  async function handleDeleteOrder(order: Order) {
    try {
      if (!order?.id) return;

      if (order.status !== "pending") {
        toast.error("Only unpaid orders can be deleted.");
        return;
      }

      await deleteDoc(doc(db, "orders", order.id));

      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      toast.success("Unpaid order deleted.");
    } catch (err) {
      console.error(err);
      toast.error("Could not delete this order.");
    }
  }

  const StageChip: React.FC<{ stage: Stage }> = ({ stage }) => {
    const base =
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border";
    const by = {
      active: "border-emerald-300 text-emerald-700 bg-emerald-50",
      completed: "border-neutral-300 text-neutral-600 bg-neutral-50",
      pending: "border-amber-300 text-amber-700 bg-amber-50",
      cancelled: "border-rose-300 text-rose-700 bg-rose-50",
      refunded: "border-sky-300 text-sky-700 bg-sky-50",
    } as const;
    return <span className={`${base} ${by[stage]}`}>{stage}</span>;
  };
  // Single slim order row
  // Replace the whole OrderRow with this version
  const OrderRow: React.FC<{ order: Order }> = ({ order }) => {
    const merchLines = normalizeMerchItems(order.merchItems);
    const hasMerch = merchLines.length > 0;
    const hasBooking = Boolean(order?.booking?.dates?.length);
    const created = (order as any)?.createdAt
      ? formatCreatedAt((order as any).createdAt)
      : "";

    const customerName = getCustomerName(order);
    const customerEmail = getCustomerEmail(order);
    const customerPhone = getCustomerPhone(order);
    const attendeeCount = order.booking?.attendees?.length || 0;
    const huntDateLabel = hasBooking
      ? formatDateRange(order.booking?.dates)
      : "Merchandise only order";

    return (
      <li
        key={order.id}
        className="rounded-3xl border border-white/10 bg-[var(--color-card)]/70 backdrop-blur px-5 py-5 shadow-sm hover:shadow-lg hover:border-white/20 transition-all"
      >
        {/* Top row */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StageChip stage={classifyStage(order)} />
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                {hasBooking ? "Reservation" : "Order"}
              </span>
            </div>

            <h3 className="mt-3 text-2xl font-acumin text-white leading-snug tracking-tight">
              {hasBooking ? huntDateLabel : "Merchandise Purchase"}
            </h3>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70 backdrop-blur">
                Order #{order.id}
              </span>

              {created && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70 backdrop-blur">
                  Placed {created}
                </span>
              )}

              {hasBooking && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70 backdrop-blur">
                  {order.booking?.numberOfHunters || 0} hunter
                  {(order.booking?.numberOfHunters || 0) !== 1 ? "s" : ""}
                </span>
              )}

              {hasBooking && !!order.booking?.partyDeckDates?.length && (
                <span className="rounded-full border border-[var(--color-accent-gold)]/30 bg-[var(--color-accent-gold)]/10 px-3 py-1 text-[var(--color-accent-gold)]">
                  Party Deck included
                </span>
              )}

              {attendeeCount > 0 && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70 backdrop-blur">
                  {attendeeCount} attendee{attendeeCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 lg:text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">
              Total
            </div>
            <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
              ${fmtMoney(order.total)}
            </div>
          </div>
        </div>

        <div className="my-6 h-px bg-white/10" />

        {/* Main content */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Trip details */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Trip Details
            </div>

            {hasBooking ? (
              <div className="mt-3 space-y-2 text-sm text-white/85">
                <div>
                  <span className="text-white/50">Dates:</span>{" "}
                  <span className="font-medium">
                    {order.booking?.dates
                      ?.map(formatFriendlyDateSafe)
                      .join(", ")}
                  </span>
                </div>

                <div>
                  <span className="text-white/50">Hunters:</span>{" "}
                  <span className="font-medium">
                    {order.booking?.numberOfHunters || 0}
                  </span>
                </div>

                {!!order.booking?.partyDeckDates?.length && (
                  <div>
                    <span className="text-white/50">Party Deck:</span>{" "}
                    <span className="font-medium">
                      {order.booking.partyDeckDates
                        .map(formatFriendlyDateSafe)
                        .join(", ")}
                    </span>
                  </div>
                )}

                {typeof (order.booking as any)?.price === "number" && (
                  <div>
                    <span className="text-white/50">Booking subtotal:</span>{" "}
                    <span className="font-medium">
                      ${fmtMoney((order.booking as any).price)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 text-sm text-white/60">
                No hunt reservation attached to this order.
              </div>
            )}
          </div>

          {/* Guest / payer info */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Guest & Payer Info
            </div>

            <div className="mt-3 space-y-2 text-sm text-white/85">
              <div>
                <span className="text-white/50">Name:</span>{" "}
                <span className="font-medium">{customerName}</span>
              </div>

              <div className="break-all">
                <span className="text-white/50">Email:</span>{" "}
                <span className="font-medium">{customerEmail}</span>
              </div>

              <div>
                <span className="text-white/50">Phone:</span>{" "}
                <span className="font-medium">{customerPhone}</span>
              </div>

              {attendeeCount > 0 && (
                <div>
                  <span className="text-white/50">Attendees listed:</span>{" "}
                  <span className="font-medium">{attendeeCount}</span>
                </div>
              )}
            </div>
          </div>

          {/* Merchandise / actions */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Merchandise
            </div>

            {hasMerch ? (
              <ul className="mt-3 space-y-2 text-sm text-white/85">
                {merchLines.map((li) => (
                  <li
                    key={li.id}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate">
                        {li.name} × {li.quantity}
                      </div>
                    </div>
                    <div className="shrink-0 font-medium">
                      ${fmtMoney(li.price * li.quantity)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 text-sm text-white/60">
                No merchandise on this order.
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-white/40">
            Need help? Contact us and reference{" "}
            <span className="font-mono">#{order.id}</span>.
          </div>

          {order.status === "paid" && (
            <button
              onClick={() => openCancelConfirm(order)}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm"
            >
              Cancel{hasBooking ? " & Refund" : ""}
            </button>
          )}

          {order.status === "pending" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => openDeleteConfirm(order)}
                className="text-xs rounded-xl border border-red-400/30 text-red-200 hover:bg-red-500/10 px-3 py-2"
              >
                Delete Order
              </button>

              <button
                onClick={() => navigate("/checkout")}
                className="text-xs rounded-xl border border-white/15 text-white/90 hover:bg-white/5 px-3 py-2"
              >
                Continue Payment
              </button>
            </div>
          )}
        </div>
      </li>
    );
  };

  // ---------------- Render ----------------
  return (
    <Boundary>
      <div className="max-w-[1400px] mx-auto text-[var(--color-text)] py-6 min-h-[600px] px-6 flex flex-col md:flex-row gap-8 mt-20 md:mt-36">
        {/* Sidebar */}
        <aside className="w-full md:w-1/4">
          <nav className="grid grid-cols-2 md:grid-cols-1 gap-3 max-w-[400px]">
            <button
              className={`text-left w-full px-4 py-3 rounded-xl border transition-all duration-300 ease-in-out ${
                activeTab === "orders"
                  ? "border-white bg-white/5 text-white shadow-sm"
                  : "border-white/10 text-white/70 hover:border-white/25 hover:bg-white/5"
              }`}
              onClick={() => setActiveTab("orders")}
            >
              <div className="font-medium">My Orders</div>
              <div className="mt-1 text-xs text-white/45">
                Reservations, purchases, and history
              </div>
            </button>

            <button
              className={`text-left w-full px-4 py-3 rounded-xl border transition-all duration-300 ease-in-out ${
                activeTab === "cart"
                  ? "border-white bg-white/5 text-white shadow-sm"
                  : "border-white/10 text-white/70 hover:border-white/25 hover:bg-white/5"
              }`}
              onClick={() => setActiveTab("cart")}
            >
              <div className="font-medium">Continue Checkout</div>
              <div className="mt-1 text-xs text-white/45">
                Resume your active cart
              </div>
            </button>
            {!user && (
              <button
                onClick={checkAndCreateUser}
                className="mt-1 text-xs underline text-neutral-500 hover:text-[var(--color-accent-gold)]"
              >
                Create My Account
              </button>
            )}
          </nav>
        </aside>

        {/* Main */}
        <section className="flex-1  w-full  backdrop-blur p-5 md:p-6 rounded-xl border border-black/5">
          {!user ? (
            <div className="text-center py-10">
              <p className="text-neutral-600">
                Please sign in to view your orders.
              </p>
            </div>
          ) : showSuccess && status === "paid" ? (
            <div className="space-y-5">
              <section className="overflow-hidden rounded-2xl border border-black/10 bg-neutral-100 shadow-[0_20px_50px_rgba(0,0,0,0.10)]">
                <div className="border-b border-black/5 bg-white/70 px-5 py-4 md:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                    Payment Confirmed
                  </p>
                  <h2 className="mt-1 text-2xl font-acumin text-[var(--color-footer)] md:text-3xl">
                    Your booking has been secured
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-footer)]/70">
                    Thank you for your payment. Your reservation is now
                    confirmed and has been added to your dashboard.
                  </p>
                </div>

                <div className="space-y-5 px-5 py-5 md:px-6 md:py-6">
                  <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 shadow-[0_10px_30px_rgba(16,185,129,0.08)]">
                    <div className="border-b border-emerald-200/70 bg-emerald-100/60 px-5 py-4 md:px-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-300 bg-white text-xl text-emerald-600 shadow-sm">
                          ✓
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-900/60">
                            Reservation Status
                          </p>
                          <h3 className="mt-1 text-lg font-acumin text-emerald-950">
                            Payment received successfully
                          </h3>
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-5 md:px-6">
                      <p className="text-sm leading-7 text-emerald-900">
                        Your order has been recorded and your dates are now
                        reserved. Please keep this confirmation for your
                        records.
                      </p>
                    </div>
                  </section>

                  {loadingSuccess ? (
                    <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                      <div className="px-5 py-10 text-center text-sm text-[var(--color-footer)]/70 md:px-6">
                        Loading order details…
                      </div>
                    </section>
                  ) : successOrder ? (
                    <>
                      <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                        <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                            Order Overview
                          </p>
                          <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                            Confirmation details
                          </h3>
                        </div>

                        <div className="px-5 py-5 md:px-6">
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                                Order Number
                              </p>
                              <p className="mt-2 break-all text-sm font-semibold text-[var(--color-footer)]">
                                #{successOrder.id}
                              </p>
                            </div>

                            <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                                Total Paid
                              </p>
                              <p className="mt-2 text-2xl font-bold text-[var(--color-footer)]">
                                ${fmtMoney(successOrder.total)}
                              </p>
                            </div>

                            <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                                Status
                              </p>
                              <p className="mt-2 text-base font-semibold text-emerald-700">
                                Paid
                              </p>
                            </div>
                          </div>
                        </div>
                      </section>

                      {successOrder.booking && (
                        <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                          <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                              Booking Overview
                            </p>
                            <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                              Your hunt details
                            </h3>
                          </div>

                          <div className="px-5 py-5 md:px-6">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                                  Hunters
                                </p>
                                <p className="mt-2 text-2xl font-bold text-[var(--color-footer)]">
                                  {successOrder.booking.numberOfHunters}
                                </p>
                              </div>

                              <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                                  Selected Dates
                                </p>
                                <p className="mt-2 text-base font-semibold text-[var(--color-footer)]">
                                  {formatDateRange(successOrder.booking.dates)}
                                </p>
                              </div>
                            </div>

                            {successOrder.booking?.dates?.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {successOrder.booking.dates.map((date) => (
                                  <span
                                    key={date}
                                    className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-[var(--color-footer)] shadow-sm"
                                  >
                                    {formatFriendlyDateSafe(date)}
                                  </span>
                                ))}
                              </div>
                            )}

                            {!!successOrder.booking.partyDeckDates?.length && (
                              <div className="mt-4 rounded-xl border border-[var(--color-accent-gold)]/30 bg-[var(--color-accent-gold)]/10 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/60">
                                  Party Deck
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {successOrder.booking.partyDeckDates.map(
                                    (date) => (
                                      <span
                                        key={date}
                                        className="inline-flex items-center rounded-full border border-[var(--color-accent-gold)]/20 bg-white px-3 py-1 text-xs font-medium text-[var(--color-footer)] shadow-sm"
                                      >
                                        {formatFriendlyDateSafe(date)}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </section>
                      )}

                      {successOrder.booking?.dates?.includes("2026-10-03") && (
                        <section className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 shadow-[0_10px_30px_rgba(37,99,235,0.08)]">
                          <div className="border-b border-blue-200/70 bg-blue-100/50 px-5 py-4 md:px-6">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-900/60">
                              Back the Blue
                            </p>
                            <h3 className="mt-1 text-lg font-acumin text-blue-950">
                              Special event booking confirmed
                            </h3>
                          </div>

                          <div className="px-5 py-5 md:px-6">
                            <p className="text-sm leading-7 text-blue-900">
                              Your order includes the October 3rd, 2026 Back the
                              Blue event. Proof will still be required at
                              check-in for this booking.
                            </p>
                          </div>
                        </section>
                      )}

                      <div className="grid gap-5 lg:grid-cols-2">
                        <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                          <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                              Customer Details
                            </p>
                            <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                              Contact information
                            </h3>
                          </div>

                          <div className="space-y-3 px-5 py-5 text-sm text-[var(--color-footer)] md:px-6">
                            <div className="flex items-start justify-between gap-4 border-b border-black/5 pb-3">
                              <span className="text-[var(--color-footer)]/65">
                                Name
                              </span>
                              <span className="text-right font-semibold">
                                {getCustomerName(successOrder)}
                              </span>
                            </div>

                            <div className="flex items-start justify-between gap-4 border-b border-black/5 pb-3">
                              <span className="text-[var(--color-footer)]/65">
                                Email
                              </span>
                              <span className="break-all text-right font-semibold">
                                {getCustomerEmail(successOrder)}
                              </span>
                            </div>

                            <div className="flex items-start justify-between gap-4">
                              <span className="text-[var(--color-footer)]/65">
                                Phone
                              </span>
                              <span className="text-right font-semibold">
                                {getCustomerPhone(successOrder)}
                              </span>
                            </div>
                          </div>
                        </section>

                        <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                          <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                              Merchandise
                            </p>
                            <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                              Items included
                            </h3>
                          </div>

                          <div className="px-5 py-5 md:px-6">
                            {!!successOrder.merchItems &&
                            (Array.isArray(successOrder.merchItems) ||
                              Object.keys(successOrder.merchItems).length >
                                0) ? (
                              <div className="space-y-3">
                                {normalizeMerchItems(
                                  successOrder.merchItems
                                ).map((li) => (
                                  <div
                                    key={li.id}
                                    className="flex items-start justify-between gap-4 rounded-xl border border-black/10 bg-neutral-50 px-4 py-4"
                                  >
                                    <div>
                                      <p className="text-sm font-semibold text-[var(--color-footer)]">
                                        {li.name}
                                      </p>
                                      <p className="mt-1 text-xs text-[var(--color-footer)]/60">
                                        Quantity: {li.quantity}
                                      </p>
                                    </div>

                                    <p className="text-sm font-semibold text-[var(--color-footer)]">
                                      ${fmtMoney(li.price * li.quantity)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--color-footer)]/65">
                                No merchandise was included with this order.
                              </p>
                            )}
                          </div>
                        </section>
                      </div>

                      <section className="overflow-hidden rounded-2xl border border-[var(--color-accent-gold)]/30 bg-[var(--color-accent-gold)]/10 shadow-[0_12px_35px_rgba(0,0,0,0.06)]">
                        <div className="border-b border-[var(--color-footer)]/10 px-5 py-4 md:px-6">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/65">
                            Next Steps
                          </p>
                          <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                            What happens next
                          </h3>
                        </div>

                        <div className="space-y-3 px-5 py-5 text-sm text-[var(--color-footer)] md:px-6">
                          <p>
                            Your reservation has been saved to your dashboard
                            and can be reviewed anytime.
                          </p>
                          <p>
                            Please arrive prepared for your booked dates and
                            keep your order number available if you need
                            support.
                          </p>
                          <p className="text-[var(--color-footer)]/70">
                            If your booking includes a special event or party
                            deck reservation, those details are reflected above.
                          </p>
                        </div>
                      </section>
                    </>
                  ) : (
                    <section className="overflow-hidden rounded-2xl border border-red-200 bg-red-50 shadow-[0_10px_30px_rgba(239,68,68,0.08)]">
                      <div className="px-5 py-6 text-center text-sm text-red-700 md:px-6">
                        Unable to load order details.
                      </div>
                    </section>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={handleSuccessDismiss}
                      className="order-2 inline-flex items-center justify-center rounded-md border border-[var(--color-footer)]/15 bg-white px-6 py-3 text-sm font-semibold text-[var(--color-footer)] transition hover:bg-neutral-50 sm:order-1"
                    >
                      View My Orders
                    </button>

                    <button
                      onClick={() => navigate("/book")}
                      className="order-1 inline-flex items-center justify-center rounded-md border border-[var(--color-footer)] bg-[var(--color-footer)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-button-hover)] sm:order-2"
                    >
                      Book Another Hunt
                    </button>
                  </div>
                </div>
              </section>
            </div>
          ) : loading ? (
            <p className="text-sm text-neutral-400">Loading your data...</p>
          ) : activeTab === "orders" ? (
            <>
              <div className="mb-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      Upcoming
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {upcomingOrders.length}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      Past Hunts
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {pastOrders.length}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      Pending Payment
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {pendingOrders.length}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-2">
                  <button
                    onClick={() => setOrdersTab("all")}
                    className={
                      "px-3 py-2 text-xs rounded-lg border transition " +
                      (ordersTab === "all"
                        ? "border-white text-white bg-white/5"
                        : "border-white/15 text-white/65 hover:border-white/30")
                    }
                  >
                    All <span className="opacity-60">({orders.length})</span>
                  </button>

                  <button
                    onClick={() => setOrdersTab("upcoming")}
                    className={
                      "px-3 py-2 text-xs rounded-lg border transition " +
                      (ordersTab === "upcoming"
                        ? "border-white text-white bg-white/5"
                        : "border-white/15 text-white/65 hover:border-white/30")
                    }
                  >
                    Upcoming{" "}
                    <span className="opacity-60">
                      ({upcomingOrders.length})
                    </span>
                  </button>

                  <button
                    onClick={() => setOrdersTab("past")}
                    className={
                      "px-3 py-2 text-xs rounded-lg border transition " +
                      (ordersTab === "past"
                        ? "border-white text-white bg-white/5"
                        : "border-white/15 text-white/65 hover:border-white/30")
                    }
                  >
                    Past{" "}
                    <span className="opacity-60">({pastOrders.length})</span>
                  </button>

                  <button
                    onClick={() => setOrdersTab("cancelled")}
                    className={
                      "px-3 py-2 text-xs rounded-lg border transition " +
                      (ordersTab === "cancelled"
                        ? "border-white text-white bg-white/5"
                        : "border-white/15 text-white/65 hover:border-white/30")
                    }
                  >
                    Cancelled / Refunded{" "}
                    <span className="opacity-60">
                      ({cancelledOrders.length})
                    </span>
                  </button>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-8 text-center">
                  <p className="text-white/75 text-base">
                    No records found in this section.
                  </p>
                  <p className="mt-2 text-sm text-white/45">
                    When you place a booking or purchase, it will appear here.
                  </p>
                </div>
              ) : (
                <ul className="grid gap-4 grid-cols-1">
                  {filteredOrders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <h2 className="text-lg mb-3  text-white font-acumin">
                Cart Status
              </h2>
              {hasCartItems ? (
                <div className="rounded-lg border border-black/5 p-4 bg-neutral-50">
                  <p className="mb-2 text-neutral-600">
                    You have items in your cart.
                  </p>
                  <button
                    onClick={() => navigate("/checkout")}
                    className="bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white px-6 py-2 rounded"
                  >
                    Continue Checkout
                  </button>
                </div>
              ) : (
                <p className="mb-2 text-neutral-500">
                  Your cart is currently empty.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {/* ---------- Cancel/Refund Confirm Modal ---------- */}
      {confirmOpen && confirmData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeCancelConfirm}
          />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl border border-black/5 p-5">
            <h3 className="text-lg font-acumin font-semibold text-neutral-900">
              Cancel order
            </h3>

            <div className="mt-3 space-y-3 text-[13px] text-neutral-700">
              <div>
                <div className="text-neutral-500">Order</div>
                <div className="font-medium break-all">
                  #{confirmData.order.id}
                </div>
              </div>

              {confirmData.hasBooking ? (
                <div>
                  <div className="text-neutral-500">First hunt date</div>
                  <div className="font-medium">
                    {confirmData.firstDate
                      ? formatFriendlyDateSafe(confirmData.firstDate)
                      : "—"}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-neutral-500">Booking</div>
                  <div className="font-medium">No booking in this order</div>
                </div>
              )}

              <div className="rounded-md bg-neutral-50 border border-black/5 p-3">
                {confirmData.eligibleForRefund ? (
                  <>
                    <div className="text-neutral-500">Refund preview</div>
                    <div className="text-base font-semibold text-green-700">
                      ${fmtMoney(confirmData.previewRefundAmount)}
                    </div>
                    <p className="mt-1 text-[12px] text-neutral-500">
                      Our policy grants a 50% refund if cancelled at least 14
                      days before the first hunt date.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-neutral-500">Refund</div>
                    <div className="text-base font-semibold text-red-700">
                      $0.00
                    </div>
                    <p className="mt-1 text-[12px] text-neutral-500">
                      {confirmData.hasBooking
                        ? "Cancellations within 14 days of the first hunt date are not refundable."
                        : "Merch-only orders are not refundable from the dashboard."}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={closeCancelConfirm}
                className="px-4 py-2 text-sm rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-800"
              >
                Keep Order
              </button>
              <button
                onClick={async () => {
                  const target = confirmData.order;
                  closeCancelConfirm();
                  await handleCancelOrder(target);
                }}
                className="px-4 py-2 text-sm rounded-md bg-red-600 hover:bg-red-700 text-white"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Delete Pending Order Confirm Modal ---------- */}
      {deleteOpen && deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeDeleteConfirm}
          />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl border border-black/5 p-5">
            <h3 className="text-lg font-acumin font-semibold text-neutral-900">
              Delete unpaid order
            </h3>

            <div className="mt-3 space-y-3 text-[13px] text-neutral-700">
              <div>
                <div className="text-neutral-500">Order</div>
                <div className="font-medium break-all">#{deleteTarget.id}</div>
              </div>

              <div className="rounded-md bg-neutral-50 border border-black/5 p-3">
                <p className="text-[13px] text-neutral-700">
                  This order has not been paid yet, so you can safely delete it
                  from your dashboard.
                </p>
                <p className="mt-2 text-[12px] text-neutral-500">
                  Paid orders cannot be deleted here and must go through the
                  cancel / refund process.
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={closeDeleteConfirm}
                className="px-4 py-2 text-sm rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-800"
              >
                Keep Order
              </button>
              <button
                onClick={async () => {
                  const target = deleteTarget;
                  closeDeleteConfirm();
                  if (target) await handleDeleteOrder(target);
                }}
                className="px-4 py-2 text-sm rounded-md bg-red-600 hover:bg-red-700 text-white"
              >
                Delete Order
              </button>
            </div>
          </div>
        </div>
      )}
    </Boundary>
  );
};

export default ClientDashboard;
