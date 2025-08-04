// /pages/ClientDashboard.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import type { NewBooking } from "../types/Types";
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";

type Tab = "bookings" | "merch" | "cart";

const ClientDashboard = () => {
  const { user, checkAndCreateUser } = useAuth();
  const [bookings, setBookings] = useState<NewBooking[]>([]);
  const [merch, setMerch] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { isHydrated, booking, merchItems } = useCart();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>("bookings");

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);

      const bookingsQuery = query(
        collection(db, "bookings"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const merchQuery = query(
        collection(db, "merchOrders"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );

      const [bookingsSnap, merchSnap] = await Promise.all([
        getDocs(bookingsQuery),
        getDocs(merchQuery),
      ]);

      setBookings(bookingsSnap.docs.map((doc) => doc.data() as NewBooking));
      setMerch(merchSnap.docs.map((doc) => doc.data()));
      setLoading(false);
    };

    fetchData();
  }, [user]);

  if (!user)
    return <div className="text-white text-center mt-10">Please sign in.</div>;

  return (
    <div className="max-w-7xl mx-auto text-[var(--color-text)] py-16 px-6 flex flex-col md:flex-row gap-8 mt-20">
      {/* Sidebar */}
      <aside className="w-full md:w-1/4">
        <h1 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-6">
          Dashboard
        </h1>
        <nav className="flex flex-col space-y-2">
          <button
            className={`text-left px-4 py-2 rounded-md ${
              activeTab === "bookings"
                ? "bg-[var(--color-accent-gold)] text-[var(--color-footer)] font-bold"
                : "bg-[var(--color-card)] hover:bg-[var(--color-button-hover)]"
            }`}
            onClick={() => setActiveTab("bookings")}
          >
            Bookings
          </button>
          <button
            className={`text-left px-4 py-2 rounded-md ${
              activeTab === "merch"
                ? "bg-[var(--color-accent-gold)] text-[var(--color-footer)] font-bold"
                : "bg-[var(--color-card)] hover:bg-[var(--color-button-hover)]"
            }`}
            onClick={() => setActiveTab("merch")}
          >
            Merch Orders
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
          <button
            onClick={checkAndCreateUser}
            className="mt-4 text-sm underline hover:text-[var(--color-accent-gold)]"
          >
            Create My Account
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <section className="flex-1 bg-[var(--color-card)] p-6 rounded-md shadow">
        {loading ? (
          <p className="text-sm text-neutral-400">Loading your data...</p>
        ) : (
          <>
            {activeTab === "bookings" && (
              <>
                <h2 className="text-xl font-bold mb-4">Your Bookings</h2>
                {bookings.length === 0 ? (
                  <p>No bookings found.</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {bookings.map((b, i) => (
                      <li key={i} className="border-b pb-2">
                        <span className="block">
                          Dates: <strong>{b.dates.join(", ")}</strong>
                        </span>
                        <span>
                          Hunters: {b.numberOfHunters} — Price: ${b.price}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {activeTab === "merch" && (
              <>
                <h2 className="text-xl font-bold mb-4">Your Merch Orders</h2>
                {merch.length === 0 ? (
                  <p>No merch orders found.</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {merch.map((order, i) => (
                      <li key={i} className="border-b pb-2">
                        {Object.values(order.items).map(
                          (item: any, j: number) => (
                            <div key={j}>
                              {item.product.name} × {item.quantity}
                            </div>
                          )
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
