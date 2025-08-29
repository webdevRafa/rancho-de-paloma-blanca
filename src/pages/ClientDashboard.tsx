// /pages/ClientDashboard.tsx
import { useEffect, useMemo, useState } from "react";
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
  const status = params.get("status");
  const orderIdParam = params.get("orderId");

  const [showSuccess, setShowSuccess] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [loadingSuccess, setLoadingSuccess] = useState(false);

  useEffect(() => {
    if (status === "pending") toast("You have an order waiting for payment.");
  }, [status]);

  useEffect(() => {
    if (status === "paid" && orderIdParam) {
      setLoadingSuccess(true);
      setShowSuccess(true);
      (async () => {
        try {
          const orderRef = doc(db, "orders", orderIdParam);
          const snap = await getDoc(orderRef);
          if (snap.exists()) {
            const data = snap.data() as Order;
            setSuccessOrder({ id: snap.id, ...(data as any) });
          } else {
            toast.error("Order not found.");
          }
        } catch (err) {
          console.error("Failed to load order", err);
          toast.error("Failed to load order details.");
        } finally {
          setLoadingSuccess(false);
        }
      })();
    }
  }, [status, orderIdParam]);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) return;
      setLoading(true);
      const ordersQuery = query(
        collection(db, "orders"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const ordersSnap = await getDocs(ordersQuery);
      const parsed = ordersSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as any;
      setOrders(parsed);
      setLoading(false);
    };
    fetchOrders();
  }, [user]);

  const formatFriendlyDate = (iso: string) => {
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
  };

  if (!user)
    return <div className="text-white text-center mt-10">Please sign in.</div>;

  const handleSuccessDismiss = () => {
    setShowSuccess(false);
    setActiveTab("orders");
    navigate("/dashboard", { replace: true });
  };

  // -------- Cancellation + Refunds --------
  const dateDiffInDays = (iso: string) => {
    const [y, m, d] = iso.split("-").map((n) => Number(n));
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate()
    );
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  };

  const extractRefundIdentifiers = (order: any) => {
    // Prefer explicit paymentId first (stored at root or under deluxe)
    const paymentId =
      order?.deluxe?.paymentId ||
      order?.paymentId ||
      order?.deluxe?.lastEvent?.paymentId ||
      order?.deluxe?.lastWebhook?.paymentId ||
      null;

    // Fallback to original transaction id variants from events/webhooks
    const tx =
      order?.deluxe?.lastEvent?.TransactionId ||
      order?.deluxe?.lastEvent?.transactionId ||
      order?.deluxe?.lastEvent?.InputData?.TransactionId ||
      order?.TransactionId ||
      order?.transactionId ||
      null;

    const txRecord =
      order?.deluxe?.lastEvent?.TransactionRecordID ||
      order?.TransactionRecordID ||
      null;

    return {
      paymentId: paymentId || undefined,
      transactionId: (tx || txRecord || undefined) as string | undefined,
    };
  };

  const handleCancelOrder = async (order: any) => {
    try {
      if (!order?.id) return;
      if (order.status === "cancelled") {
        toast.info("Order already cancelled.");
        return;
      }

      const firstDate: string | undefined = order?.booking?.dates
        ?.slice()
        ?.sort()?.[0];
      const hunters: number = Number(order?.booking?.numberOfHunters || 0);
      const wasPaid = order.status === "paid";
      const daysUntil = firstDate ? dateDiffInDays(firstDate) : 0;
      const eligible = !!firstDate && daysUntil >= 14 && wasPaid;
      const refundAmount = eligible
        ? Math.round(order.total * 0.5 * 100) / 100
        : 0;

      // Build refund body if eligible
      let refundRequestBody: any | null = null;
      let refundResponseBody: any | null = null;
      let refundOk = false;

      if (refundAmount > 0) {
        const ids = extractRefundIdentifiers(order);
        refundRequestBody = {
          amount: refundAmount,
          currency: order.currency || "USD",
          reason: "Customer cancellation per policy",
          ...(ids.paymentId ? { paymentId: ids.paymentId } : {}),
          ...(!ids.paymentId && ids.transactionId
            ? { transactionId: ids.transactionId }
            : {}),
        };
        if (refundRequestBody.paymentId || refundRequestBody.transactionId) {
          const resp = await fetch("/api/refundDeluxePayment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(refundRequestBody),
          });
          try {
            refundResponseBody = await resp.json();
          } catch {
            refundResponseBody = {
              raw: await resp.text().catch(() => ""),
            } as any;
          }
          if (resp.ok) {
            refundOk = true;
            toast.success(`Refund initiated for $${refundAmount.toFixed(2)}`);
          } else {
            console.warn("Refund API failed", refundResponseBody);
            toast.error(
              "Refund request failed; cancelling order without refund."
            );
          }
        } else {
          toast.error("Payment reference missing; cancelling without refund.");
        }
      }

      // Firestore updates (atomic)
      const batch = writeBatch(db);
      const orderRef = doc(db, "orders", order.id);
      batch.set(
        orderRef,
        {
          status: "cancelled",
          refundAmount: refundAmount || 0,
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          deluxe: {
            ...(order?.deluxe || {}),
            ...(refundRequestBody
              ? { lastRefundRequest: refundRequestBody }
              : {}),
            ...(refundResponseBody
              ? { lastRefundResponse: refundResponseBody }
              : {}),
            refundSucceeded: refundOk,
            updatedAt: serverTimestamp(),
          },
        },
        { merge: true }
      );

      // Capacity release only if the order had been paid (capacity was incremented on approval)
      if (wasPaid && order?.booking?.dates?.length && hunters > 0) {
        for (const date of order.booking.dates as string[]) {
          const availRef = doc(db, "availability", date);
          batch.set(
            availRef,
            {
              huntersBooked: increment(-hunters),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          if (
            Array.isArray(order?.booking?.partyDeckDates) &&
            order.booking.partyDeckDates.includes(date)
          ) {
            batch.set(
              availRef,
              { partyDeckBooked: false, updatedAt: serverTimestamp() },
              { merge: true }
            );
          }
        }
      }

      await batch.commit();

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

  const successSummary = useMemo(() => {
    if (!successOrder) return null;
    const lines: string[] = [];
    if (successOrder.booking?.dates?.length) {
      lines.push(
        `Dates: ${successOrder.booking.dates
          .map((d: string) => formatFriendlyDate(d))
          .join(", ")}`
      );
      lines.push(`Hunters: ${successOrder.booking.numberOfHunters}`);
      if (successOrder.booking.partyDeckDates?.length) {
        lines.push(
          `Party Deck Days: ${successOrder.booking.partyDeckDates
            .map((d: string) => formatFriendlyDate(d))
            .join(", ")}`
        );
      }
    }
    return lines;
  }, [successOrder]);

  return (
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
        {showSuccess && status === "paid" ? (
          <div className="flex flex-col items-center justify-center text-center min-h-[300px]">
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 shadow-lg">
              <span className="text-4xl">✓</span>
            </div>
            <h2 className="mt-6 text-2xl font-bold text-green-500">
              Payment Successful
            </h2>
            <p className="mt-2 text-sm text-neutral-400 max-w-md">
              Thank you for your purchase! Your order has been confirmed and is
              now available in your dashboard.
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
                {successSummary && (
                  <div className="space-y-1">
                    <p className="font-semibold">Booking</p>
                    <div className="ml-4 space-y-0.5">
                      {successSummary.map((l, i) => (
                        <p key={i}>{l}</p>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="font-semibold">Total</p>
                  <p className="ml-4">${successOrder.total.toFixed(2)}</p>
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
                    {orders.map((order: any) => (
                      <li
                        key={order.id}
                        className="border-b pb-4 border-[var(--color-footer)]"
                      >
                        <p className="text-xs uppercase text-neutral-400 mb-1">
                          {order.status === "pending" ? (
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
                          )}
                        </p>

                        {order.booking && (
                          <div className="mb-2">
                            <strong>Booking:</strong>
                            <div className="ml-4 space-y-1">
                              <p>
                                Dates:{" "}
                                {order.booking.dates
                                  .map((d: string) => formatFriendlyDate(d))
                                  .join(", ")}
                              </p>
                              <p>Hunters: {order.booking.numberOfHunters}</p>
                              {order.booking.partyDeckDates?.length > 0 && (
                                <p>
                                  Party Deck Days:{" "}
                                  {order.booking.partyDeckDates
                                    .map((d: string) => formatFriendlyDate(d))
                                    .join(", ")}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {order.merchItems && (
                          <div className="mb-2">
                            <strong>Merch Items:</strong>
                            <ul className="ml-4 list-disc">
                              {Object.entries(order.merchItems).map(
                                ([id, item]: any) => (
                                  <li key={id}>
                                    {(item as any).product.name} ×{" "}
                                    {(item as any).quantity} = $
                                    {(
                                      ((item as any).product.price || 0) *
                                      ((item as any).quantity || 0)
                                    ).toFixed(2)}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}

                        <p className="mt-2 font-semibold">
                          Total: ${Number(order.total || 0).toFixed(2)}
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
                              Refund policy: 50% if cancelled ≥ 14 days before
                              first hunt date; otherwise no refund.
                            </p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {activeTab === "cart" && (
              <>
                <h2 className="text-xl font-bold mb-4">Cart Status</h2>
                {isHydrated &&
                (booking || Object.keys(merchItems).length > 0) ? (
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
  );
};

export default ClientDashboard;
