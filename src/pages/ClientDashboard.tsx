// /pages/ClientDashboard.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
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

  useEffect(() => {
    if (status === "pending") {
      // Show a toast or message like:
      toast("You have an order waiting for payment.");
    }
  }, [status]);
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
        {loading ? (
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
                                <p>
                                  Booking Total: $
                                  {order.booking.price.toFixed(2)}
                                </p>
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
                                      {item.product.price * item.quantity}
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
