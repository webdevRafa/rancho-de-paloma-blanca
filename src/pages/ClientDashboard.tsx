// /pages/ClientDashboard.tsx (patched to prevent hook-order mismatch after cancel+refresh)
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
 * WHY THIS PATCH?
 * - Your dashboard crashed after cancel -> refresh with “Minified React error #310”.
 *   That error typically means “rendered fewer hooks than expected / invalid hook call”.
 *   The most common trigger is an early return that skips some hooks on a later render.
 * - This version keeps the hook call order 100% stable across every render and adds
 *   extra guards for merch‑only orders (no booking dates).
 * - Also: we hardened cancel logic and rendering for orders missing fields.
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

/** Normalize merch lines (supports object map or legacy array shapes). */
function normalizeMerchItems(merch: Order["merchItems"]) {
  if (!merch)
    return [] as Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
    }>;
  // If it is an array (legacy), convert to a map-ish array
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
  // Object map
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

/** Lightweight error boundary (keeps app usable if any render throws). */
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

const ClientDashboard: React.FC = () => {
  // ----- Hooks (must be called in the exact same order on every render) -----
  const { user, checkAndCreateUser } = useAuth();
  const { isHydrated, booking, merchItems } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [loadingSuccess, setLoadingSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const status = params.get("status"); // 'pending' | 'paid' | null
  const orderIdParam = params.get("orderId");

  // NOTE: We do *not* early-return before these hooks. We'll render a "please sign in"
  // panel later, but the component *always* calls the same hooks each render.

  // Show a gentle nudge when we come back from checkout with a pending order
  useEffect(() => {
    if (status === "pending") toast("You have an order waiting for payment.");
  }, [status]);

  // If redirected with ?status=paid&orderId=..., load that order for the success panel
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
        console.warn(
          "Primary orders query failed; falling back without orderBy.",
          err
        );
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
          console.error("Fallback orders query also failed.", err2);
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

  // Cancel & refund (with merch-only awareness)
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
      const eligibleForRefund = hasBooking && isPaid && dUntil >= 14; // merch‑only => false
      const totalNum =
        typeof order.total === "number"
          ? order.total
          : Number(order.total) || 0;
      const refundAmount = eligibleForRefund
        ? Math.round(totalNum * 0.5 * 100) / 100
        : 0;

      // 1) If eligible, attempt Deluxe refund via our function (non‑blocking UI flow)
      let refundPayload: any = null;
      if (refundAmount > 0) {
        // Prefer the real paymentId; avoid matching paymentLinkId
        const paymentId = findDeepId(order.deluxe, /\bpaymentId\b/i) || null;

        // If we don't have a paymentId, fall back to originalTransactionId, then transactionId
        const originalTransactionId =
          findDeepId(order.deluxe, /\boriginalTransactionId\b/i) ||
          findDeepId(order.deluxe, /\btransactionId\b/i) ||
          null;

        const body: any = {
          amount: refundAmount,
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
          if (r.ok)
            toast.success(`Refund initiated for $${fmtMoney(refundAmount)}`);
          else toast.error("Refund request failed; cancelling without refund.");
        } catch (e) {
          console.error("Refund network error", e);
          toast.error(
            "Could not reach refund service; cancelling without refund."
          );
        }
      }

      // 2) Firestore updates (cancel order, free capacity, and (server should) restock merch)
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

      // Free booked hunt capacity (if there was a booking)
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

      // NOTE: Merch restock should be handled *server-side* (webhook or dedicated function)
      // because inventory integrity must not rely on the client.
      // If you need a quick stopgap, create a callable/HTTPS function that takes
      // the orderId and performs atomic restock for each merch line.
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

  // ----- Render (single return — no conditional early returns) -----
  return (
    <Boundary>
      <div className="max-w-[1400px] mx-auto text-[var(--color-text)] py-6 min-h-[600px] px-6 flex flex-col md:flex-row gap-8 mt-20 md:mt-40 bg-neutral-100">
        {/* Sidebar */}
        <aside className="w-full md:w-1/4">
          <h1 className="text-2xl font-acumin text-[var(--color-background)] font-bold mb-6">
            Dashboard
          </h1>
          <nav className="flex flex-col space-y-2">
            <button
              className={`text-left px-4 py-2 rounded-md text-[var(--color-background)] hover:scale-105 hover:bg-white transition-all duration-300 ease-in-out  ${
                activeTab === "orders"
                  ? "bg-white shadow-lg"
                  : "bg-neutral-100 hover:bg-white"
              }`}
              onClick={() => setActiveTab("orders")}
            >
              My Orders
            </button>
            <button
              className={`text-left px-4 py-2 rounded-md fonbt-bold text-[var(--color-background)] hover:scale-105 hover:bg-white transition-all duration-300 ease-in-out ${
                activeTab === "cart"
                  ? "bg-white shadow-lg scale-105"
                  : "bg-neutral-100"
              }`}
              onClick={() => setActiveTab("cart")}
            >
              Continue Checkout
            </button>
            {!user && (
              <button
                onClick={checkAndCreateUser}
                className="mt-4 text-sm underline hover:text-[var(--color-accent-gold)]"
              >
                Create My Account
              </button>
            )}
          </nav>
        </aside>

        {/* Main Content */}
        <section className="flex-1 bg-white p-6 rounded-md shadow">
          {/* If no user, show a stable, safe panel — we NEVER early-return above. */}
          {!user ? (
            <div className="text-center py-10">
              <p className="text-white">Please sign in to view your orders.</p>
            </div>
          ) : showSuccess && status === "paid" ? (
            <div className="flex flex-col items-center justify-center text-center min-h-[300px]">
              <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 shadow-lg">
                <span className="text-4xl">✓</span>
              </div>
              <h2 className="mt-6 text-2xl font-bold text-green-500">
                Payment Successful
              </h2>
              <p className="mt-2 text-sm text-neutral-400 max-w-md">
                Thank you for your purchase! Your order has been confirmed and
                is now available in your dashboard.
              </p>

              {loadingSuccess ? (
                <p className="mt-6 text-sm text-neutral-400">
                  Loading order details…
                </p>
              ) : successOrder ? (
                <div className="mt-6 w-full max-w-lg text-left bg-[var(--color-footer)]/10 p-4 rounded-md space-y-4 border border-green-200">
                  <div>
                    <p className="text-sm text-neutral-400">Order ID</p>
                    <p className="font-mono text-sm break-all">
                      {successOrder.id}
                    </p>
                  </div>

                  {successOrder.booking && (
                    <div className="space-y-1">
                      <p className="font-semibold">Booking</p>
                      <div className="ml-4 space-y-0.5">
                        <p>
                          Dates:{" "}
                          {successOrder.booking.dates
                            .map(formatFriendlyDateSafe)
                            .join(", ")}
                        </p>
                        <p>Hunters: {successOrder.booking.numberOfHunters}</p>
                        {successOrder.booking.partyDeckDates?.length ? (
                          <p>
                            Party Deck Days:{" "}
                            {successOrder.booking.partyDeckDates
                              .map(formatFriendlyDateSafe)
                              .join(", ")}
                          </p>
                        ) : null}
                        {typeof (successOrder as any)?.booking?.price ===
                          "number" && (
                          <p>
                            Booking Total: $
                            {fmtMoney((successOrder as any).booking.price)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {!!successOrder.merchItems &&
                    (Array.isArray(successOrder.merchItems) ||
                      Object.keys(successOrder.merchItems).length > 0) && (
                      <div className="space-y-1">
                        <p className="font-semibold">Merch Items</p>
                        <ul className="ml-4 list-disc space-y-0.5">
                          {normalizeMerchItems(successOrder.merchItems).map(
                            (li) => (
                              <li key={li.id}>
                                {li.name} × {li.quantity} = $
                                {fmtMoney(li.price * li.quantity)}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}

                  <div>
                    <p className="font-semibold">Total</p>
                    <p className="ml-4">${fmtMoney(successOrder.total)}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-6 text-sm text-red-400">
                  Unable to load order details.
                </p>
              )}

              <button
                onClick={handleSuccessDismiss}
                className="mt-8 px-6 py-2 rounded-md bg-[var(--color-button)] text-white hover:bg-[var(--color-button-hover)]"
              >
                View My Orders
              </button>
            </div>
          ) : loading ? (
            <p className="text-sm text-neutral-400">Loading your data...</p>
          ) : activeTab === "orders" ? (
            <>
              <h2 className="text-xl font-bold mb-2 text-[var(--color-background)] font-acumin">
                My Orders
              </h2>
              {orders.length === 0 ? (
                <p className="text-[var(--color-background)]/60">
                  No orders found.
                </p>
              ) : (
                <ul className="space-y-4 text-sm">
                  {orders.map((order) => {
                    const merchLines = normalizeMerchItems(order.merchItems);
                    const hasBooking = Boolean(order?.booking?.dates?.length);

                    const statusPill =
                      order.status === "pending" ? (
                        <span className="text-yellow-400 font-semibold">
                          ⏳ Pending Payment
                        </span>
                      ) : order.status === "paid" ? (
                        <span className="text-green-400 font-semibold">
                          ✅ Paid
                        </span>
                      ) : (
                        <span className="text-red-400 font-semibold">
                          ❌ Cancelled
                        </span>
                      );

                    return (
                      <li
                        key={order.id || Math.random()}
                        className="border-b pb-4 border-[var(--color-footer)]"
                      >
                        <p className="text-xs uppercase text-neutral-400 mb-1">
                          {statusPill}
                        </p>

                        {hasBooking && (
                          <div className="mb-2">
                            <strong>Booking:</strong>
                            <div className="ml-4 space-y-1">
                              <p>
                                Dates:{" "}
                                {order
                                  .booking!.dates!.map(formatFriendlyDateSafe)
                                  .join(", ")}
                              </p>
                              <p>Hunters: {order.booking!.numberOfHunters}</p>
                              {order.booking!.partyDeckDates?.length ? (
                                <p>
                                  Party Deck Days:{" "}
                                  {order
                                    .booking!.partyDeckDates.map(
                                      formatFriendlyDateSafe
                                    )
                                    .join(", ")}
                                </p>
                              ) : null}
                              {typeof (order as any)?.booking?.price ===
                                "number" && (
                                <p>
                                  Booking Total: $
                                  {fmtMoney((order as any).booking.price)}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {merchLines.length > 0 && (
                          <div className="mb-2">
                            <strong>Merch Items:</strong>
                            <ul className="ml-4 list-disc">
                              {merchLines.map((li) => (
                                <li key={li.id}>
                                  {li.name} × {li.quantity} = $
                                  {fmtMoney(li.price * li.quantity)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <p className="mt-2 font-semibold">
                          Total: ${fmtMoney(order.total)}
                        </p>

                        {order.status === "paid" && (
                          <div className="mt-3">
                            <button
                              className="px-3 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => handleCancelOrder(order)}
                            >
                              Cancel Order
                              {hasBooking ? " & Request Refund" : ""}
                            </button>
                            <p className="text-xs text-neutral-400 mt-1">
                              {hasBooking
                                ? "Refund policy: 50% if cancelled ≥ 14 days before first hunt date; otherwise no refund."
                                : "Merch‑only orders are not refundable via the dashboard."}
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-3 text-[var(--color-background)] font-acumin">
                Cart Status
              </h2>
              {hasCartItems ? (
                <div>
                  <p className="mb-2 text-[var(--color-background)]/60">
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
                <p>Your cart is currently empty.</p>
              )}
            </>
          )}
        </section>
      </div>
    </Boundary>
  );
};

export default ClientDashboard;
