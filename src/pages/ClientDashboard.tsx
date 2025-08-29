// /pages/ClientDashboard.tsx
import { useEffect, useState } from "react";
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
import { useNavigate } from "react-router-dom";
import type { Order } from "../types/Types";
import { useLocation } from "react-router-dom";
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
  const status = params.get("status"); // will be 'pending'
  const orderIdParam = params.get("orderId");

  /**
   * State to drive the payment success experience. When a user is redirected
   * back from the checkout flow with `?status=paid&orderId=…` in the URL, we
   * fetch the corresponding order from Firestore and present a friendly
   * confirmation card. While the order is being fetched the page shows a
   * loading indicator. Once the user acknowledges the success screen we
   * remove the query params and return them to their dashboard.
   */
  const [showSuccess, setShowSuccess] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [loadingSuccess, setLoadingSuccess] = useState(false);

  useEffect(() => {
    if (status === "pending") {
      // Show a toast or message like:
      toast("You have an order waiting for payment.");
    }
  }, [status]);

  // When redirected back from the checkout page with a successful payment,
  // fetch the order details and display a confirmation card. We only run
  // this effect when `status` is "paid" and an orderId is present. The
  // dependencies ensure the order is fetched again if the query params
  // change. Once the order is fetched we set `showSuccess` to true which
  // triggers the success component in the render.
  useEffect(() => {
    if (status === "paid" && orderIdParam) {
      // Immediately show the success container and load the order
      setLoadingSuccess(true);
      setShowSuccess(true);
      const fetchOrder = async () => {
        try {
          const orderRef = doc(db, "orders", orderIdParam);
          const snap = await getDoc(orderRef);
          if (snap.exists()) {
            const data = snap.data() as Order;
            // Attach the id to the data object for convenience
            const order: Order = { id: snap.id, ...data };
            setSuccessOrder(order);
          } else {
            toast.error("Order not found.");
          }
        } catch (err) {
          console.error("Failed to load order", err);
          toast.error("Failed to load order details.");
        } finally {
          setLoadingSuccess(false);
        }
      };
      fetchOrder();
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
      const parsed = ordersSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Order),
      }));
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

  // Handler invoked when the user dismisses the success message. It removes
  // the query parameters and returns the user to their dashboard. We set
  // `replace: true` so the "?status=paid" page doesn't linger in history.
  const handleSuccessDismiss = () => {
    setShowSuccess(false);
    setActiveTab("orders");
    navigate("/dashboard", { replace: true });
  };

  // --- Cancel & Refund logic (Deluxe) ---
  const daysUntil = (iso: string) => {
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
  };

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
      const refundAmount = eligibleForRefund
        ? Math.round(order.total * 0.5 * 100) / 100
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
          currency: order.currency || "USD",
        };
        if (paymentId) body.paymentId = paymentId;
        else if (transactionId) body.transactionId = transactionId;

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
          toast.success(`Refund initiated for $${refundAmount.toFixed(2)}`);
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
          // If we had the party deck on this date, release it.
          if ((order as any)?.booking?.partyDeckDates?.includes(date)) {
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
        {/* If we are showing the success message, render it first */}
        {showSuccess && status === "paid" ? (
          <div className="flex flex-col items-center justify-center text-center min-h-[300px]">
            {/* Success indicator */}
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 shadow-lg">
              <span className="text-4xl">✓</span>
            </div>
            <h2 className="mt-6 text-2xl font-bold text-green-500">
              Payment Successful
            </h2>
            <p className="mt-2 text-sm text-neutral-400 max-w-md">
              Thank you for your purchase! Your order has been confirmed and is
              now available in your dashboard. Below is a summary of your order
              for your records.
            </p>
            {/* Order summary */}
            {loadingSuccess ? (
              <p className="mt-6 text-sm text-neutral-400">
                Loading order details…
              </p>
            ) : successOrder ? (
              <div className="mt-6 w-full max-w-lg text-left bg-[var(--color-footer)]/10 p-4 rounded-md space-y-4 border border-green-200">
                {/* Order ID */}
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
                          .map(formatFriendlyDate)
                          .join(", ")}
                      </p>
                      <p>Hunters: {successOrder.booking.numberOfHunters}</p>
                      {successOrder.booking.partyDeckDates?.length > 0 && (
                        <p>
                          Party Deck Days:{" "}
                          {successOrder.booking.partyDeckDates
                            .map(formatFriendlyDate)
                            .join(", ")}
                        </p>
                      )}
                      {typeof successOrder.booking.price !== "undefined" && (
                        <p>
                          Booking Total: $
                          {successOrder.booking.price?.toFixed(2).toString()}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {successOrder.merchItems &&
                  Object.keys(successOrder.merchItems).length > 0 && (
                    <div className="space-y-1">
                      <p className="font-semibold">Merch Items</p>
                      <ul className="ml-4 list-disc space-y-0.5">
                        {Object.entries(successOrder.merchItems).map(
                          ([id, item]) => (
                            <li key={id}>
                              {item.product.name} × {item.quantity} = $
                              {(item.product.price * item.quantity).toFixed(2)}
                            </li>
                          )
                        )}
                      </ul>
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
                    {orders.map((order) => (
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
                          <>
                            <div className="mb-2">
                              <strong>Booking:</strong>
                              <div className="ml-4 space-y-1">
                                <p>
                                  Dates:{" "}
                                  {order.booking.dates
                                    .map(formatFriendlyDate)
                                    .join(", ")}
                                </p>
                                <p>Hunters: {order.booking.numberOfHunters}</p>
                                {order.booking.partyDeckDates?.length > 0 && (
                                  <p>
                                    Party Deck Days:{" "}
                                    {order.booking.partyDeckDates
                                      .map(formatFriendlyDate)
                                      .join(", ")}
                                  </p>
                                )}
                                {typeof order.booking.price !== "undefined" && (
                                  <p>
                                    Booking Total: $
                                    {order.booking.price.toFixed(2)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </>
                        )}

                        {order.merchItems && (
                          <>
                            <div className="mb-2">
                              <strong>Merch Items:</strong>
                              <ul className="ml-4 list-disc">
                                {Object.entries(order.merchItems).map(
                                  ([id, item]) => (
                                    <li key={id}>
                                      {item.product.name} × {item.quantity} = $
                                      {(
                                        item.product.price * item.quantity
                                      ).toFixed(2)}
                                    </li>
                                  )
                                )}
                              </ul>
                            </div>
                          </>
                        )}

                        <p className="mt-2 font-semibold">
                          Total: ${order.total.toFixed(2)}
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
