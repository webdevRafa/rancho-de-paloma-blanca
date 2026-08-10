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
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  History,
  Mail,
  ReceiptText,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import "./ClientDashboard.css";

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

/** Format whole-dollar display values with commas (ex: 48500 -> 48,500). */
function fmtWholeMoney(n: unknown): string {
  const num = typeof n === "number" ? n : Number(n);
  return Number.isFinite(num)
    ? new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(num)
    : "0";
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

function toLocalMidnight(iso?: string): Date | null {
  if (!iso) return null;
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  } catch {
    return null;
  }
}

function todayLocalIso(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// UX stage for the first pill = hunt timing, not payment state
type Stage = "upcoming" | "active" | "completed" | "cancelled" | "refunded";

function classifyStage(order: Order): Stage {
  if (order.status === "refunded") return "refunded";
  if (order.status === "cancelled") return "cancelled";

  const dates = Array.isArray(order?.booking?.dates)
    ? [...order.booking.dates].sort()
    : [];

  if (dates.length === 0) return "completed";

  const first = toLocalMidnight(dates[0]);
  const last = toLocalMidnight(dates[dates.length - 1]);

  if (!first || !last) return "completed";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayIso = todayLocalIso();
  const hasHuntToday = dates.includes(todayIso);

  if (today < first) return "upcoming";
  if (today > last) return "completed";
  if (hasHuntToday) return "active";

  return "upcoming";
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

type CancelPreview = {
  order: Order;
  hasBooking: boolean;
  firstDate?: string;
  eligibleForRefund: boolean;
  previewRefundAmount: number;
};

const ClientDashboard: React.FC = () => {
  // ---------------- Hooks (fixed order) ----------------
  const { user } = useAuth();
  useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [loadingSuccess, setLoadingSuccess] = useState(false);
  type OrdersTab = "all" | "upcoming" | "pending" | "past" | "cancelled";
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
        return stage === "upcoming" || stage === "active";
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

  const confirmedUpcomingOrders = useMemo(
    () => upcomingOrders.filter((o) => o.status === "paid"),
    [upcomingOrders]
  );

  const filteredOrders = useMemo(() => {
    if (ordersTab === "cancelled") return cancelledOrders;
    if (ordersTab === "upcoming") return upcomingOrders;
    if (ordersTab === "pending") return pendingOrders;
    if (ordersTab === "past") return pastOrders;
    return orders;
  }, [
    orders,
    cancelledOrders,
    upcomingOrders,
    pendingOrders,
    pastOrders,
    ordersTab,
  ]);

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
    const label = {
      upcoming: "Upcoming",
      active: "Hunt day",
      completed: "Completed",
      cancelled: "Cancelled",
      refunded: "Refunded",
    } as const;

    return (
      <span className={`client-stage-chip client-stage-chip--${stage}`}>
        {label[stage]}
      </span>
    );
  };

  // Single slim order row
  // Replace the whole OrderRow with this version
  const OrderRow: React.FC<{ order: Order }> = ({ order }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const merchLines = normalizeMerchItems(order.merchItems);
    const hasMerch = merchLines.length > 0;
    const hasBooking = Boolean(order?.booking?.dates?.length);
    const created = (order as any)?.createdAt
      ? formatCreatedAt((order as any).createdAt)
      : "";

    const customerName = getCustomerName(order);
    const customerEmail = getCustomerEmail(order);
    const customerPhone = getCustomerPhone(order);
    const attendees = order.booking?.attendees ?? [];
    const attendeeCount = attendees.length || 0;
    const stage = classifyStage(order);
    const huntDateLabel = hasBooking
      ? formatDateRange(order.booking?.dates)
      : "Merchandise only order";

    const allDates = hasBooking ? [...(order.booking?.dates ?? [])].sort() : [];
    const partyDeckDates = [...(order.booking?.partyDeckDates ?? [])].sort();
    const bookingSubtotal =
      typeof (order.booking as any)?.price === "number"
        ? (order.booking as any).price
        : null;

    return (
      <li
        key={order.id}
        className="client-order-card"
      >
        {/* Collapsed / summary header */}
        <div className="client-order-summary">
          <div className="client-order-summary__grid">
            <div className="client-order-summary__main">
              <div className="client-order-eyebrow">
                <StageChip stage={stage} />
                <span className="client-order-type">
                  {hasBooking ? "Reservation" : "Order"}
                </span>
              </div>

              <h3 className="client-order-title">
                {huntDateLabel}
              </h3>

              <div className="client-order-meta">
                <button
                  type="button"
                  onClick={async () => {
                    if (!order.id) {
                      toast.error("Order ID unavailable.");
                      return;
                    }

                    try {
                      await navigator.clipboard.writeText(order.id);
                      toast.success("Reference copied.");
                    } catch (error) {
                      console.error("Failed to copy order ID:", error);
                      toast.error("Failed to copy order ID.");
                    }
                  }}
                  disabled={!order.id}
                  className="client-order-meta__item client-order-reference"
                  aria-label="Copy order reference"
                >
                  <span className="truncate">
                    Order #{order.id ?? "Unavailable"}
                  </span>
                  <Copy aria-hidden="true" size={13} strokeWidth={1.8} />
                </button>

                {created && (
                  <span className="client-order-meta__item">
                    Placed {created}
                  </span>
                )}

                {hasBooking && (
                  <span className="client-order-meta__item">
                    {order.booking?.numberOfHunters || 0} hunter
                    {(order.booking?.numberOfHunters || 0) !== 1 ? "s" : ""}
                  </span>
                )}

                {hasMerch && (
                  <span className="client-order-meta__item">
                    {merchLines.length} merch item
                    {merchLines.length !== 1 ? "s" : ""}
                  </span>
                )}

                {!!partyDeckDates.length && (
                  <span className="client-order-meta__item client-order-meta__item--gold">
                    Party Deck included
                  </span>
                )}
              </div>
            </div>

            <div className="client-order-summary__aside">
              {order.status === "paid" && (
                <span className="client-payment-chip client-payment-chip--paid">
                  <CheckCircle2 aria-hidden="true" size={13} /> Paid in full
                </span>
              )}

              {order.status === "pending" && (
                <span className="client-payment-chip client-payment-chip--pending">
                  <Clock3 aria-hidden="true" size={13} /> Payment needed
                </span>
              )}

              {order.status === "cancelled" && (
                <span className="client-payment-chip client-payment-chip--cancelled">
                  Cancelled
                </span>
              )}

              {order.status === "refunded" && (
                <span className="client-payment-chip client-payment-chip--refunded">
                  Refunded
                </span>
              )}

              <div className="client-order-total">
                <div className="client-order-total__label">
                  Total
                </div>
                <div className="client-order-total__value">
                  <span aria-hidden="true">$</span>
                  {fmtWholeMoney(order.total)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="client-order-toggle"
                aria-expanded={isExpanded}
              >
                {isExpanded ? "Hide details" : "View order details"}
                <span
                  className={`inline-block text-[11px] transition-transform ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                >
                  ▼
                </span>
              </button>
            </div>
          </div>
        </div>

        {order.status === "pending" && (
          <div className="client-payment-callout" role="status">
            <div>
              <strong>Finish payment to confirm this reservation.</strong>
              <span>Your dates are not secured until checkout is complete.</span>
            </div>
            <button type="button" onClick={() => navigate("/checkout")}>
              Continue payment <ArrowRight aria-hidden="true" size={16} />
            </button>
          </div>
        )}

        {/* Expanded details */}
        {isExpanded && (
          <>
            <div className="client-order-divider" />

            <div className="client-order-details">
              <div className="client-order-details__grid">
                {/* Reservation details */}
                <div className="client-detail-panel">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/36">
                      Reservation Details
                    </div>
                    {hasBooking && (
                      <div className="text-xs text-white/45">
                        {allDates.length} date{allDates.length !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>

                  {hasBooking ? (
                    <div className="mt-3 space-y-2.5 text-[14px] text-white/86">
                      <div>
                        <span className="text-white/56">Date range:</span>{" "}
                        <span className="font-medium">{huntDateLabel}</span>
                      </div>

                      <div>
                        <span className="text-white/56">Hunters:</span>{" "}
                        <span className="font-medium">
                          {order.booking?.numberOfHunters || 0}
                        </span>
                      </div>

                      {bookingSubtotal !== null && (
                        <div>
                          <span className="text-white/56">
                            Booking subtotal:
                          </span>{" "}
                          <span className="font-medium">
                            ${fmtMoney(bookingSubtotal)}
                          </span>
                        </div>
                      )}

                      <div>
                        <div className="mb-2 text-white/50">
                          Selected dates:
                        </div>
                        <div className="order-details-scroll max-h-36 overflow-y-auto pr-1">
                          <div className="flex flex-wrap gap-2">
                            {allDates.map((date) => (
                              <span
                                key={date}
                                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
                              >
                                {formatFriendlyDateSafe(date)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {!!partyDeckDates.length && (
                        <div>
                          <div className="mb-2 text-white/50">
                            Party Deck dates:
                          </div>
                          <div className="order-details-scroll max-h-28 overflow-y-auto pr-1">
                            <div className="flex flex-wrap gap-2">
                              {partyDeckDates.map((date) => (
                                <span
                                  key={date}
                                  className="inline-flex items-center rounded-full border border-[var(--color-accent-gold)]/30 bg-[var(--color-accent-gold)]/10 px-3 py-1 text-xs text-[var(--color-accent-gold)]"
                                >
                                  {formatFriendlyDateSafe(date)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-white/60">
                      No hunt reservation is attached to this order.
                    </div>
                  )}
                </div>

                {/* Guest / attendee details */}
                <div className="client-detail-panel">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/36">
                    Guest & Attendee Details
                  </div>

                  <div className="mt-3 space-y-2 text-[14px] text-white/86">
                    <div>
                      <span className="text-white/56">Booked by:</span>{" "}
                      <span className="font-medium">{customerName}</span>
                    </div>

                    <div className="break-all">
                      <span className="text-white/56">Email:</span>{" "}
                      <span className="font-medium">{customerEmail}</span>
                    </div>

                    <div>
                      <span className="text-white/56">Phone:</span>{" "}
                      <span className="font-medium">{customerPhone}</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-white/56">Attendees</div>
                      <div className="text-xs text-white/45">
                        {attendeeCount} listed
                      </div>
                    </div>

                    {attendeeCount > 0 ? (
                      <div className="order-details-scroll max-h-40 space-y-2 overflow-y-auto pr-1">
                        {attendees.map((attendee, idx) => (
                          <div
                            key={`${attendee.fullName}-${idx}`}
                            className="rounded-xl border border-white/10 bg-white/[0.028] px-3 py-2"
                          >
                            <div className="text-sm font-medium text-white">
                              {attendee.fullName || `Attendee ${idx + 1}`}
                            </div>

                            {attendee.email && (
                              <div className="mt-1 break-all text-xs text-white/55">
                                {attendee.email}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5 text-[13px] text-white/54">
                        No attendee names were saved on this order.
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment / merchandise / actions */}
                <div className="client-detail-panel">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/36">
                    Order & Payment
                  </div>

                  <div className="mt-3 space-y-2 text-[14px] text-white/86">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/56">Order ID</span>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!order.id) {
                            toast.error("Order ID unavailable.");
                            return;
                          }

                          try {
                            await navigator.clipboard.writeText(order.id);
                            toast.success("Reference copied.");
                          } catch (error) {
                            console.error("Failed to copy order ID:", error);
                            toast.error("Failed to copy order ID.");
                          }
                        }}
                        disabled={!order.id}
                        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/80 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="truncate max-w-[140px]">
                          #{order.id ?? "Unavailable"}
                        </span>

                        {/* Clipboard Icon */}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3.5 w-3.5 opacity-70"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16h8M8 12h8M8 8h8M9 4h6a2 2 0 012 2v14l-5-3-5 3V6a2 2 0 012-2z"
                          />
                        </svg>
                      </button>
                    </div>

                    {created && (
                      <div>
                        <span className="text-white/56">Placed:</span>{" "}
                        <span className="font-medium">{created}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-white/56">Payment Status:</span>{" "}
                      <span className="font-medium capitalize">
                        {order.status}
                      </span>
                    </div>
                  </div>

                  {hasMerch && (
                    <div className="mt-4">
                      <div className="mb-2 text-white/50">Merchandise</div>

                      <div className="order-details-scroll max-h-40 space-y-2 overflow-y-auto pr-1">
                        {merchLines.map((li) => (
                          <div
                            key={li.id}
                            className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm text-white">
                                {li.name}
                              </div>
                              <div className="text-xs text-white/45">
                                Qty {li.quantity}
                              </div>
                            </div>

                            <div className="shrink-0 text-sm font-medium text-white">
                              ${fmtMoney(li.price * li.quantity)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="client-order-actions">
                <div className="client-order-help">
                  Need help? Contact us and reference{" "}
                  <span className="font-mono text-white/58">#{order.id}</span>.
                </div>

                {order.status === "paid" && (
                  <button
                    onClick={() => openCancelConfirm(order)}
                    className="client-order-button client-order-button--danger"
                  >
                    Review cancellation{hasBooking ? " / refund" : ""}
                  </button>
                )}

                {order.status === "pending" && (
                  <div className="client-order-actions__buttons">
                    <button
                      onClick={() => openDeleteConfirm(order)}
                      className="client-order-button client-order-button--danger-outline"
                    >
                      Delete unpaid order
                    </button>

                    <button
                      onClick={() => navigate("/checkout")}
                      className="client-order-button client-order-button--primary"
                    >
                      Continue payment <ArrowRight aria-hidden="true" size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </li>
    );
  };

  const accountName = user?.displayName?.trim() || "Your account";
  const accountInitials = accountName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const orderTabClassName = (tab: OrdersTab) =>
    `client-orders-tab${ordersTab === tab ? " is-active" : ""}`;

  // ---------------- Render ----------------
  return (
    <Boundary>
      <div className="client-dashboard">
        <section className="client-dashboard__shell">
          <header className="client-dashboard-hero">
            <div className="client-dashboard-hero__copy">
              <span className="client-dashboard-kicker">
                <ReceiptText aria-hidden="true" size={15} /> Client dashboard
              </span>
              <h1>Your bookings</h1>
              <p>
                Review your hunt dates, payment status, and order details.
              </p>
              {user && (
                <button
                  type="button"
                  className="client-dashboard-book-button"
                  onClick={() => navigate("/book")}
                >
                  Book another hunt <ArrowRight aria-hidden="true" size={17} />
                </button>
              )}
            </div>

            <aside className="client-account-card" aria-label="Signed in account">
              <div className="client-account-card__label">
                <ShieldCheck aria-hidden="true" size={15} /> Signed in as
              </div>
              <div className="client-account-card__identity">
                <div className="client-account-card__avatar" aria-hidden="true">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" />
                  ) : accountInitials ? (
                    accountInitials
                  ) : (
                    <UserRound size={21} />
                  )}
                </div>
                <div className="client-account-card__text">
                  <strong>{accountName}</strong>
                  <span>
                    <Mail aria-hidden="true" size={14} />
                    {user?.email || "No email available"}
                  </span>
                </div>
              </div>
              <div className="client-account-card__status">
                <span aria-hidden="true" /> Account active
              </div>
            </aside>
          </header>

          {!user ? (
            <div className="client-dashboard-empty">
              <p>
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
                              <div className="mt-4 rounded-xl border border-black/5 bg-neutral-50 p-3">
                                <div className="details-scroll max-h-36 overflow-y-auto pr-1">
                                  <div className="flex flex-wrap gap-2">
                                    {successOrder.booking.dates.map((date) => (
                                      <span
                                        key={date}
                                        className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-[var(--color-footer)] shadow-sm"
                                      >
                                        {formatFriendlyDateSafe(date)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {!!successOrder.booking.partyDeckDates?.length && (
                              <div className="mt-4 rounded-xl border border-[var(--color-accent-gold)]/30 bg-[var(--color-accent-gold)]/10 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/60">
                                  Party Deck
                                </p>

                                <div className="details-scroll mt-2 max-h-36 overflow-y-auto pr-1">
                                  <div className="flex flex-wrap gap-2">
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
            <div className="client-dashboard-loading" role="status">
              <span />
              <div>
                <strong>Loading your bookings</strong>
                <p>Getting your latest order details.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="client-orders-overview">
                <div className="client-orders-overview__heading">
                  <div>
                    <span>At a glance</span>
                    <h2>Your reservation activity</h2>
                  </div>
                  <p>Counts are based on the orders connected to this account.</p>
                </div>

                <div className="client-order-stats">
                  <button
                    type="button"
                    className="client-order-stat"
                    onClick={() => setOrdersTab("upcoming")}
                    aria-label={`${confirmedUpcomingOrders.length} confirmed upcoming hunts. Show upcoming orders.`}
                  >
                    <span className="client-order-stat__icon client-order-stat__icon--confirmed">
                      <CalendarDays aria-hidden="true" size={20} />
                    </span>
                    <span className="client-order-stat__text">
                      <strong>{confirmedUpcomingOrders.length}</strong>
                      <span>Confirmed hunts</span>
                      <small>Upcoming reservations that are paid</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} className="client-order-stat__arrow" />
                  </button>

                  <button
                    type="button"
                    className={`client-order-stat ${
                      pendingOrders.length ? "client-order-stat--attention" : ""
                    }`}
                    onClick={() => setOrdersTab("pending")}
                    aria-label={`${pendingOrders.length} orders need payment. Show unpaid orders.`}
                  >
                    <span className="client-order-stat__icon client-order-stat__icon--pending">
                      <Clock3 aria-hidden="true" size={20} />
                    </span>
                    <span className="client-order-stat__text">
                      <strong>{pendingOrders.length}</strong>
                      <span>Needs payment</span>
                      <small>Orders waiting for checkout</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} className="client-order-stat__arrow" />
                  </button>

                  <button
                    type="button"
                    className="client-order-stat"
                    onClick={() => setOrdersTab("past")}
                    aria-label={`${pastOrders.length} completed hunts. Show completed orders.`}
                  >
                    <span className="client-order-stat__icon client-order-stat__icon--history">
                      <History aria-hidden="true" size={20} />
                    </span>
                    <span className="client-order-stat__text">
                      <strong>{pastOrders.length}</strong>
                      <span>Completed hunts</span>
                      <small>Your past reservation history</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} className="client-order-stat__arrow" />
                  </button>
                </div>

                <div className="client-orders-toolbar">
                  <div>
                    <span>Order history</span>
                    <h2>All bookings and purchases</h2>
                  </div>
                  <div
                    className="client-orders-tabs"
                    role="tablist"
                    aria-label="Filter orders"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={ordersTab === "all"}
                      onClick={() => setOrdersTab("all")}
                      className={orderTabClassName("all")}
                    >
                      All <span>{orders.length}</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={ordersTab === "upcoming"}
                      onClick={() => setOrdersTab("upcoming")}
                      className={orderTabClassName("upcoming")}
                    >
                      Upcoming <span>{upcomingOrders.length}</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={ordersTab === "pending"}
                      onClick={() => setOrdersTab("pending")}
                      className={orderTabClassName("pending")}
                    >
                      Needs payment <span>{pendingOrders.length}</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={ordersTab === "past"}
                      onClick={() => setOrdersTab("past")}
                      className={orderTabClassName("past")}
                    >
                      Completed <span>{pastOrders.length}</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={ordersTab === "cancelled"}
                      onClick={() => setOrdersTab("cancelled")}
                      className={orderTabClassName("cancelled")}
                    >
                      Cancelled / refunded <span>{cancelledOrders.length}</span>
                    </button>
                  </div>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="client-orders-empty" role="status">
                  <ReceiptText aria-hidden="true" size={24} />
                  <p>No orders in this view.</p>
                  <span>Bookings and purchases for this account will appear here.</span>
                </div>
              ) : (
                <ul className="client-orders-list" aria-live="polite">
                  {filteredOrders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      {/* ---------- Cancel/Refund Confirm Modal ---------- */}
      {confirmOpen && confirmData && (
        <div
          className="client-dashboard-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-order-title"
        >
          <div
            className="client-dashboard-modal__backdrop"
            onClick={closeCancelConfirm}
          />
          <div className="client-dashboard-modal__card">
            <h3 id="cancel-order-title">
              Cancel order
            </h3>

            <div className="client-dashboard-modal__body">
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

              <div className="client-dashboard-modal__notice">
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

            <div className="client-dashboard-modal__actions">
              <button
                onClick={closeCancelConfirm}
                className="client-dashboard-modal__secondary"
              >
                Keep Order
              </button>
              <button
                onClick={async () => {
                  const target = confirmData.order;
                  closeCancelConfirm();
                  await handleCancelOrder(target);
                }}
                className="client-dashboard-modal__danger"
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
          className="client-dashboard-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-order-title"
        >
          <div
            className="client-dashboard-modal__backdrop"
            onClick={closeDeleteConfirm}
          />
          <div className="client-dashboard-modal__card">
            <h3 id="delete-order-title">
              Delete unpaid order
            </h3>

            <div className="client-dashboard-modal__body">
              <div>
                <div className="text-neutral-500">Order</div>
                <div className="font-medium break-all">#{deleteTarget.id}</div>
              </div>

              <div className="client-dashboard-modal__notice">
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

            <div className="client-dashboard-modal__actions">
              <button
                onClick={closeDeleteConfirm}
                className="client-dashboard-modal__secondary"
              >
                Keep Order
              </button>
              <button
                onClick={async () => {
                  const target = deleteTarget;
                  closeDeleteConfirm();
                  if (target) await handleDeleteOrder(target);
                }}
                className="client-dashboard-modal__danger"
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
