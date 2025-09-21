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
type Stage = "active" | "completed" | "pending" | "cancelled";
function classifyStage(
  order: Order
): "active" | "completed" | "pending" | "cancelled" {
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "pending") return "pending";
  const first = firstHuntDate(order);
  if (!first) return "completed"; // paid merch-only
  return isPast(first) ? "completed" : "active"; // <— now uses isPast
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
  type OrdersTab = "all" | "paid" | "cancelled";
  const [ordersTab, setOrdersTab] = useState<OrdersTab>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<CancelPreview | null>(null);

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
    (async () => {
      if (status === "paid" && orderIdParam) {
        try {
          setLoadingSuccess(true);
          setShowSuccess(true);
          const snap = await getDoc(doc(db, "orders", orderIdParam));
          if (!abort) {
            if (snap.exists())
              setSuccessOrder({ id: snap.id, ...(snap.data() as Order) });
            else toast.error("Order not found.");
          }
        } catch (err) {
          console.error("Failed to load order", err);
          if (!abort) toast.error("Failed to load order details.");
        } finally {
          if (!abort) setLoadingSuccess(false);
        }
      }
    })();
    return () => {
      abort = true;
    };
  }, [status, orderIdParam]);

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
    () => orders.filter((o) => o.status !== "cancelled"),
    [orders]
  );
  const cancelledOrders = useMemo(
    () => orders.filter((o) => o.status === "cancelled"),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    if (ordersTab === "cancelled") return cancelledOrders;
    return orders;
  }, [orders, validOrders, cancelledOrders, ordersTab]);

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

      // 2) Firestore updates (cancel order, free capacity)
      const batch = writeBatch(db);
      const orderRef = doc(db, "orders", order.id!);
      batch.set(
        orderRef,
        {
          status: "cancelled",
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
            ? ({ ...o, status: "cancelled", refundAmount } as any)
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

  const StageChip: React.FC<{ stage: Stage }> = ({ stage }) => {
    const base =
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border";
    const by = {
      active: "border-emerald-300 text-emerald-700 bg-emerald-50",
      completed: "border-neutral-300 text-neutral-600 bg-neutral-50",
      pending: "border-amber-300 text-amber-700 bg-amber-50",
      cancelled: "border-rose-300 text-rose-700 bg-rose-50",
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

    return (
      <li
        key={order.id}
        className="rounded-2xl border border-white/10 bg-[var(--color-card)]/60 backdrop-blur px-5 py-4 shadow-sm hover:shadow-lg hover:border-white/20 transition-all"
      >
        {/* Header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <StageChip stage={classifyStage(order)} />
            <div>
              <div className="text-[13px] text-white/70 leading-none">
                Order
              </div>
              <div className="text-sm font-medium text-white break-all">
                #{order.id}
              </div>
              {created && (
                <div className="mt-0.5 text-[11px] text-white/50">
                  Placed {created}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[12px] uppercase tracking-wide text-white/50">
                Total
              </div>
              <div className="text-lg font-semibold text-white">
                ${fmtMoney(order.total)}
              </div>
            </div>

            {order.status === "paid" && (
              <button
                onClick={() => openCancelConfirm(order)}
                className="text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-2"
              >
                Cancel{hasBooking ? " & Refund" : ""}
              </button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 h-px bg-white/10" />

        {/* Content grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Booking panel */}
          <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-wide text-white/50">
              {hasBooking ? "Hunt Booking" : "Booking"}
            </div>

            {hasBooking ? (
              <div className="mt-2 space-y-2 text-[13px] text-white/85">
                <div>
                  <span className="text-white/60">Hunters:</span>{" "}
                  <span className="font-medium">
                    {order.booking!.numberOfHunters}
                  </span>
                </div>

                <div className="leading-snug">
                  <span className="text-white/60">Dates:</span>{" "}
                  {order.booking!.dates!.map(formatFriendlyDateSafe).join(", ")}
                </div>

                {!!order.booking!.partyDeckDates?.length && (
                  <div className="leading-snug">
                    <span className="text-white/60">Party Deck:</span>{" "}
                    {order
                      .booking!.partyDeckDates.map(formatFriendlyDateSafe)
                      .join(", ")}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 text-[13px] text-white/60">
                No hunt booking in this order (merch-only).
              </div>
            )}
          </div>

          {/* Merch panel */}
          <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-wide text-white/50">
              Merchandise
            </div>

            {hasMerch ? (
              <ul className="mt-2 space-y-1 text-[13px] text-white/85">
                {merchLines.map((li) => (
                  <li key={li.id} className="flex items-center justify-between">
                    <div className="truncate">
                      {li.name} <span className="text-white/55">×</span>{" "}
                      {li.quantity}
                    </div>
                    <div className="ml-4 shrink-0 font-medium">
                      ${fmtMoney(li.price * li.quantity)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-[13px] text-white/60">
                No merchandise on this order.
              </div>
            )}
          </div>
        </div>

        {/* Footer hint (optional) */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-[11px] text-white/40">
            Need help? Contact us and reference{" "}
            <span className="font-mono">#{order.id}</span>.
          </div>
          {order.status === "pending" && (
            <button
              onClick={() => navigate("/checkout")}
              className="text-xs rounded-md border border-white/15 text-white/90 hover:bg-white/5 px-3 py-1.5"
            >
              Continue Payment
            </button>
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
          <nav className="grid grid-cols-2 md:grid-cols-1 gap-2 max-w-[400px] ">
            <button
              className={`text-left w-full px-4 py-2 rounded-lg border border-white/0 transition-all duration-300 ease-in-out ${
                activeTab === "orders" && "border-white/100"
              } `}
              onClick={() => setActiveTab("orders")}
            >
              My Orders
            </button>
            <button
              className={`text-left rounded-lg w-full  px-4 py-2 border border-white/0 transition-all duration-300 ease-in-out ${
                activeTab === "cart" && "border-white/100"
              } `}
              onClick={() => setActiveTab("cart")}
            >
              Continue Checkout
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
            <div className="relative flex flex-col items-center text-center min-h-[360px] py-8">
              {/* Success emblem */}
              <div className="relative">
                <div className="h-24 w-24 rounded-full bg-emerald-600/10 ring-2 ring-emerald-400/50 flex items-center justify-center shadow-lg">
                  <span className="text-4xl text-emerald-500">✓</span>
                </div>
                <div
                  className="absolute -inset-2 rounded-full animate-ping bg-emerald-400/10"
                  aria-hidden
                />
              </div>

              {/* Title + blurb */}
              <h2 className="mt-5 text-2xl font-gin text-white">
                Payment Successful
              </h2>
              <p className="mt-2 text-sm text-neutral-400 max-w-[42ch]">
                Thank you for your purchase. Your order has been added to your
                dashboard.
              </p>

              {/* Body states */}
              {loadingSuccess ? (
                <p className="mt-8 text-sm text-neutral-400">
                  Loading order details…
                </p>
              ) : successOrder ? (
                <div className="mt-8 w-full max-w-xl text-left rounded-2xl border border-white/10 bg-[var(--color-card)]/60 backdrop-blur p-5">
                  {/* Order header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-neutral-400">
                        Order
                      </div>
                      <div className="font-mono text-sm text-white break-all">
                        #{successOrder.id}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wide text-neutral-400">
                        Total
                      </div>
                      <div className="text-lg font-semibold text-white">
                        ${fmtMoney(successOrder.total)}
                      </div>
                    </div>
                  </div>

                  <hr className="my-4 border-white/10" />

                  {/* Booking */}
                  {successOrder.booking && (
                    <div className="grid gap-2">
                      <div className="text-sm font-medium text-white">
                        Hunt Booking
                      </div>
                      <ul className="ml-4 list-disc space-y-1 text-[13px] text-neutral-300">
                        <li>
                          <span className="text-neutral-400">Dates:</span>{" "}
                          {successOrder.booking.dates
                            .map(formatFriendlyDateSafe)
                            .join(", ")}
                        </li>
                        <li>
                          <span className="text-neutral-400">Hunters:</span>{" "}
                          {successOrder.booking.numberOfHunters}
                        </li>
                        {!!successOrder.booking.partyDeckDates?.length && (
                          <li>
                            <span className="text-neutral-400">
                              Party Deck:
                            </span>{" "}
                            {successOrder.booking.partyDeckDates
                              .map(formatFriendlyDateSafe)
                              .join(", ")}
                          </li>
                        )}
                        {typeof (successOrder as any)?.booking?.price ===
                          "number" && (
                          <li>
                            <span className="text-neutral-400">
                              Booking Subtotal:
                            </span>{" "}
                            ${fmtMoney((successOrder as any).booking.price)}
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Merch */}
                  {!!successOrder.merchItems &&
                    (Array.isArray(successOrder.merchItems) ||
                      Object.keys(successOrder.merchItems).length > 0) && (
                      <>
                        <hr className="my-4 border-white/10" />
                        <div className="grid gap-2">
                          <div className="text-sm font-medium text-white">
                            Merch Items
                          </div>
                          <ul className="ml-4 list-disc space-y-1 text-[13px] text-neutral-300">
                            {normalizeMerchItems(successOrder.merchItems).map(
                              (li) => (
                                <li key={li.id}>
                                  {li.name} × {li.quantity} — $
                                  {fmtMoney(li.price * li.quantity)}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      </>
                    )}

                  {/* Total footer */}
                  <hr className="my-4 border-white/10" />
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-neutral-400">
                      We’ve emailed your receipt.
                    </div>
                    <div className="text-base font-semibold text-white">
                      ${fmtMoney(successOrder.total)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-8 text-sm text-red-400">
                  Unable to load order details.
                </p>
              )}

              {/* Actions */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handleSuccessDismiss}
                  className="px-6 py-2 rounded-md bg-[var(--color-button)] text-white hover:bg-[var(--color-button-hover)]"
                >
                  View My Orders
                </button>
                <button
                  onClick={() => navigate("/book")}
                  className="px-6 py-2 rounded-md border border-white/10 text-white/90 hover:bg-white/5"
                >
                  Book Another Hunt
                </button>
              </div>
            </div>
          ) : loading ? (
            <p className="text-sm text-neutral-400">Loading your data...</p>
          ) : activeTab === "orders" ? (
            <>
              <div className="flex items-center justify-between mb-3">
                {/* Tabs */}
                <div className="flex items-center gap-1 rounded-lg border border-black/5 p-1">
                  <button
                    onClick={() => setOrdersTab("all")}
                    className={
                      "px-3 py-1.5 text-xs rounded-md border " +
                      (ordersTab === "all"
                        ? "border-white text-white"
                        : "border-white/20")
                    }
                  >
                    All <span className="opacity-60">({orders.length})</span>
                  </button>

                  <button
                    onClick={() => setOrdersTab("cancelled")}
                    className={
                      "px-3 py-1.5 text-xs rounded-md border " +
                      (ordersTab === "cancelled"
                        ? "border-white text-white"
                        : "border-white/20")
                    }
                  >
                    Cancelled{" "}
                    <span className="opacity-60">
                      ({cancelledOrders.length})
                    </span>
                  </button>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <p className="text-neutral-500"></p>
              ) : (
                <ul className="grid gap-4 grid-cols-1">
                  {filteredOrders.map((order) => (
                    <OrderRow key={order.id || Math.random()} order={order} />
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
    </Boundary>
  );
};

export default ClientDashboard;
