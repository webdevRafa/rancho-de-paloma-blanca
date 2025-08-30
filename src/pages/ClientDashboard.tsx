// /pages/ClientDashboard.tsx (hardened)
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

// ------------------------------
// Utilities (defensive helpers)
// ------------------------------

/** Safely coerce any numeric-like value to a 2-decimal string. */
function fmtMoney(n: unknown): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!isFinite(num)) return "0.00";
  return num.toFixed(2);
}

/** Format YYYY-MM-DD safely; returns a friendly label or a fallback. */
function formatFriendlyDateSafe(iso?: unknown): string {
  if (typeof iso !== "string" || !/\d{4}-\d{2}-\d{2}/.test(iso)) {
    return "Unknown date";
  }
  try {
    const [yyyy, mm, dd] = iso.split("-");
    const year = Number(yyyy);
    const monthIndex = Number(mm) - 1;
    const day = Number(dd);
    const dateObj = new Date(year, monthIndex, day);
    const month = dateObj.toLocaleString("en-US", { month: "long" });
    const weekday = dateObj.toLocaleString("en-US", { weekday: "long" });
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
    return `${weekday}, ${month} ${day}${suffix}, ${year}`;
  } catch {
    return iso;
  }
}

/** Narrow/normalize merch lines to a simple array for rendering. */
function normalizeMerchItems(merch: Order["merchItems"]) {
  if (!merch || typeof merch !== "object") return [];
  try {
    return Object.entries(merch).map(([id, item]) => ({
      id,
      name: item?.product?.name ?? "Item",
      price:
        typeof item?.product?.price === "number"
          ? item.product.price
          : Number(item?.product?.price) || 0,
      quantity:
        typeof item?.quantity === "number"
          ? item.quantity
          : Number(item?.quantity) || 0,
    }));
  } catch {
    return [];
  }
}

/** Days until a date (YYYY-MM-DD), rounded; negative if in the past. */
function daysUntil(iso: string) {
  try {
    const [y, m, d] = iso.split("-").map((n) => Number(n));
    const target = new Date(y, m - 1, d);
    const now = new Date();
    // strip time for accurate day diff
    const msPerDay = 24 * 60 * 60 * 1000;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate()
    );
    return Math.round((end.getTime() - start.getTime()) / msPerDay);
  } catch {
    return 0;
  }
}

// ------------------------------
// Lightweight Error Boundary
// ------------------------------

class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("ClientDashboard error boundary:", error);
    toast.error("Something went wrong rendering your dashboard.");
  }
  render() {
    if (this.state.error) {
      return (
        <div className="max-w-3xl mx-auto text-center text-red-300 bg-red-900/10 border border-red-700 rounded-md p-6 mt-24">
          <h2 className="text-xl font-semibold">We hit a snag</h2>
          <p className="text-sm mt-2">
            Try reloading the page. If this keeps happening, please contact
            support.
          </p>
        </div>
      );
    }
    return this.props.children as any;
  }
}

type Tab = "orders" | "cart";

const ClientDashboard = () => {
  const { user, checkAndCreateUser } = useAuth();
  const { isHydrated, booking, merchItems } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const status = params.get("status"); // 'pending' or 'paid'
  const orderIdParam = params.get("orderId");

  // Payment success UI control
  const [showSuccess, setShowSuccess] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [loadingSuccess, setLoadingSuccess] = useState(false);

  useEffect(() => {
    if (status === "pending") {
      toast("You have an order waiting for payment.");
    }
  }, [status]);

  // Fetch the just-paid order if redirected with ?status=paid&orderId=...
  useEffect(() => {
    let abort = false;
    async function run() {
      if (status === "paid" && orderIdParam) {
        try {
          setLoadingSuccess(true);
          setShowSuccess(true);
          const orderRef = doc(db, "orders", orderIdParam);
          const snap = await getDoc(orderRef);
          if (!abort) {
            if (snap.exists()) {
              const data = snap.data() as Order;
              setSuccessOrder({ id: snap.id, ...data });
            } else {
              toast.error("Order not found.");
            }
          }
        } catch (err) {
          console.error("Failed to load order", err);
          if (!abort) toast.error("Failed to load order details.");
        } finally {
          if (!abort) setLoadingSuccess(false);
        }
      }
    }
    run();
    return () => {
      abort = true;
    };
  }, [status, orderIdParam]);

  // Fetch this user's orders (defensively)
  useEffect(() => {
    let abort = false;
    async function fetchOrders() {
      if (!user) return;
      setLoading(true);
      try {
        // Primary: orderBy createdAt desc (requires index)
        const q = query(
          collection(db, "orders"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        if (abort) return;
        const parsed = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Order),
        }));
        setOrders(parsed);
      } catch (err: any) {
        console.error("fetchOrders failed, attempting fallback", err);
        // Fallback: without orderBy (works even if composite index is missing)
        try {
          const q2 = query(
            collection(db, "orders"),
            where("userId", "==", user.uid)
          );
          const snap2 = await getDocs(q2);
          if (abort) return;
          const parsed2 = snap2.docs
            .map((d) => ({ id: d.id, ...(d.data() as Order) }))
            .sort((a, b) => {
              const ta = (a as any).createdAt?.seconds ?? 0;
              const tb = (b as any).createdAt?.seconds ?? 0;
              return tb - ta;
            });
          setOrders(parsed2);
          toast.info("Using fallback order sort (index not ready).");
        } catch (err2) {
          console.error("Fallback fetchOrders also failed", err2);
          toast.error("Could not load your orders.");
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }
    fetchOrders();
    return () => {
      abort = true;
    };
  }, [user]);

  if (!user) {
    return <div className="text-white text-center mt-10">Please sign in.</div>;
  }

  const handleSuccessDismiss = () => {
    setShowSuccess(false);
    setActiveTab("orders");
    navigate("/dashboard", { replace: true });
  };

  // Cancel & Refund logic
  const handleCancelOrder = async (order: Order) => {
    try {
      if (!order?.id) return;
      if (order.status === "cancelled") {
        toast.info("Order already cancelled.");
        return;
      }
      const firstDate = order?.booking?.dates?.slice()?.sort()?.[0];
      const nHunters = order?.booking?.numberOfHunters || 0;
      const isPaid = order.status === "paid";
      const dUntil = firstDate ? daysUntil(firstDate) : 0;
      const eligibleForRefund = !!firstDate && dUntil >= 14 && isPaid;
      const totalNum =
        typeof order.total === "number"
          ? order.total
          : Number(order.total) || 0;
      const refundAmount = eligibleForRefund
        ? Math.round(totalNum * 0.5 * 100) / 100
        : 0;

      // 1) Try Deluxe refund if eligible and we have a payment reference
      let refundPayload: any = null;
      if (refundAmount > 0) {
        const paymentId =
          (order as any)?.deluxe?.paymentId ||
          (order as any)?.deluxe?.lastEvent?.paymentId ||
          (order as any)?.deluxe?.lastEvent?.PaymentId ||
          null;
        const transactionId =
          (order as any)?.deluxe?.lastEvent?.TransactionId ||
          (order as any)?.deluxe?.lastEvent?.TransactionRecordID ||
          null;

        const body: any = {
          amount: refundAmount,
          currency: (order as any)?.currency || "USD",
        };
        if (paymentId) body.paymentId = paymentId;
        else if (transactionId) body.transactionId = transactionId;

        try {
          const resp = await fetch("/api/refundDeluxePayment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          refundPayload = await resp.json().catch(() => null);
          if (!resp.ok) {
            console.error("Refund API failed", refundPayload);
            toast.error(
              "Refund request failed; cancelling order without refund."
            );
          } else {
            toast.success(`Refund initiated for $${fmtMoney(refundAmount)}`);
          }
        } catch (e) {
          console.error("Refund network error", e);
          toast.error(
            "Could not reach refund service; cancelling without refund."
          );
        }
      }

      // 2) Update Firestore: cancel order and free capacity
      const batch = writeBatch(db);
      const orderRef = doc(db, "orders", order.id);
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

      if (order?.booking?.dates?.length && nHunters > 0) {
        for (const date of order.booking.dates) {
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
      // Refresh local UI
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

  // Pre-format some derived data for render safety
  const hasCartItems = useMemo(
    () =>
      isHydrated &&
      (Boolean(booking) || Object.keys(merchItems || {}).length > 0),
    [isHydrated, booking, merchItems]
  );

  return (
    <Boundary>
      <div className="max-w-8xl mx-auto text-[var(--color-text)] py-16 px-6 flex flex-col md:flex-row gap-8 mt-20">
        {/* Sidebar */}
        <aside className="w-full md:w-1/4">
          <h1 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-6">
            Dashboard
          </h1>
          <nav className="flex flex-col space-y-2">
            <button
              className={`text-left px-4 py-2 rounded-md ${
                activeTab === "orders"
                  ? "bg-[var(--color-accent-gold)] text-[var(--color-footer)] font-bold"
                  : "bg-[var(--color-card)] hover:bg-[var(--color-button-hover)]"
              }`}
              onClick={() => setActiveTab("orders")}
            >
              My Orders
            </button>
            <button
              className={`text-left px-4 py-2 rounded-md ${
                activeTab === "cart"
                  ? "bg-[var(--color-accent-gold)] text-[var(--color-footer)] font-bold"
                  : "bg-[var(--color-card)] hover:bg-[var(--color-button-hover)]"
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
        <section className="flex-1 bg-[var(--color-card)] p-6 rounded-md shadow">
          {/* Payment success drawer */}
          {showSuccess && status === "paid" ? (
            <div className="flex flex-col items-center justify-center text-center min-h-[300px]">
              <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 shadow-lg">
                <span className="text-4xl">✓</span>
              </div>
              <h2 className="mt-6 text-2xl font-bold text-green-500">
                Payment Successful
              </h2>
              <p className="mt-2 text-sm text-neutral-400 max-w-md">
                Thank you for your purchase! Your order has been confirmed and
                is now available in your dashboard. Below is a summary for your
                records.
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
                        {"price" in successOrder.booking && (
                          <p>
                            Booking Total: $
                            {fmtMoney((successOrder.booking as any).price)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {!!successOrder.merchItems &&
                    Object.keys(successOrder.merchItems).length > 0 && (
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
          ) : (
            <>
              {activeTab === "orders" && (
                <>
                  <h2 className="text-xl font-bold mb-4">My Orders</h2>
                  {orders.length === 0 ? (
                    <p>No orders found.</p>
                  ) : (
                    <ul className="space-y-4 text-sm">
                      {orders.map((order) => {
                        const merchLines = normalizeMerchItems(
                          order.merchItems
                        );

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
                            key={order.id}
                            className="border-b pb-4 border-[var(--color-footer)]"
                          >
                            <p className="text-xs uppercase text-neutral-400 mb-1">
                              {statusPill}
                            </p>

                            {order.booking && (
                              <div className="mb-2">
                                <strong>Booking:</strong>
                                <div className="ml-4 space-y-1">
                                  <p>
                                    Dates:{" "}
                                    {order.booking.dates
                                      .map(formatFriendlyDateSafe)
                                      .join(", ")}
                                  </p>
                                  <p>
                                    Hunters: {order.booking.numberOfHunters}
                                  </p>
                                  {order.booking.partyDeckDates?.length ? (
                                    <p>
                                      Party Deck Days:{" "}
                                      {order.booking.partyDeckDates
                                        .map(formatFriendlyDateSafe)
                                        .join(", ")}
                                    </p>
                                  ) : null}
                                  {"price" in order.booking && (
                                    <p>
                                      Booking Total: $
                                      {fmtMoney((order.booking as any).price)}
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
                                  Cancel Order & Request Refund
                                </button>
                                <p className="text-xs text-neutral-400 mt-1">
                                  Refund policy: 50% if cancelled ≥ 14 days
                                  before first hunt date; otherwise no refund.
                                </p>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}

              {activeTab === "cart" && (
                <>
                  <h2 className="text-xl font-bold mb-4">Cart Status</h2>
                  {hasCartItems ? (
                    <div>
                      <p className="mb-2">You have items in your cart.</p>
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
            </>
          )}
        </section>
      </div>
    </Boundary>
  );
};

export default ClientDashboard;
