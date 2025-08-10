// /pages/BookingPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import BookingForm from "../components/BookingForm";
import EditBookingDatesModal from "../components/EditBookingDatesModal";
import { useCart } from "../context/CartContext";
import dove from "../assets/dove.webp";
const BookingPage = () => {
  const navigate = useNavigate();
  const { booking, merchItems, resetCart } = useCart();

  const hasBooking = !!booking && booking.dates?.length > 0;
  const hasMerch = Object.keys(merchItems).length > 0;
  const hasActiveCart = hasBooking || hasMerch;

  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="min-h-screen text-[var(--color-text)] relative">
      {/* Hero / header */}
      <div className="w-full h-[40vh] md:h-[50vh] z-[-20] opacity-50 blur-[1px]">
        <img className="object-cover h-full w-full" src={dove} alt="" />
      </div>

      <div className="max-w-4xl mx-auto px-6 -mt-16 pb-24 z-40 relative">
        <AnimatePresence mode="wait">
          {!hasActiveCart ? (
            // Show the full form when there is no active cart
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.4 }}
            >
              <BookingForm />
            </motion.div>
          ) : (
            // Cart-in-progress panel replaces the form
            <motion.div
              key="cart-blocker"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.4 }}
              className="bg-white rounded-xl shadow-2xl p-8 mt-10"
            >
              <h2 className="text-2xl md:text-3xl text-[var(--color-background)] font-acumin mb-2">
                You’ve got a cart in progress
              </h2>
              <p className="text-sm text-[var(--color-background)] mb-6">
                You already started a booking and/or added merchandise. Finish
                checkout or edit your dates below. If you want to start over,
                you can clear your cart.
              </p>

              <div className="space-y-2 text-sm rounded-xl">
                {hasBooking && (
                  <div className="rounded-md p-4 bg-neutral-200 ">
                    <p className="font-semibold text-[var(--color-footer)]">
                      Current Booking
                    </p>
                    <ul className="ml-5 list-disc text-[var(--color-footer)]">
                      <li>Dates: {booking!.dates.join(", ")}</li>
                      <li>Hunters: {booking!.numberOfHunters}</li>
                      {!!booking!.partyDeckDates?.length && (
                        <li>
                          Party Deck Days: {booking!.partyDeckDates.length}
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {hasMerch && (
                  <div className="bg-neutral-200  rounded-md p-4 ">
                    <p className="font-semibold text-[var(--color-footer)]">
                      Merch Items
                    </p>
                    <ul className="ml-5 list-disc text-[var(--color-footer)]">
                      {Object.entries(merchItems).map(([id, item]) => (
                        <li key={id}>
                          {item.product.name} × {item.quantity}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate("/checkout")}
                  className="flex-1 bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white px-3 py-3 rounded-md font-semibold text-sm"
                >
                  Go to Checkout
                </button>

                {hasBooking && (
                  <button
                    onClick={() => setEditOpen(true)}
                    className="flex-1 bg-[var(--color-accent-gold)] text-[var(--color-footer)] px-3 py-3 rounded-md font-bold text-sm"
                  >
                    Edit Dates
                  </button>
                )}

                <button
                  onClick={resetCart}
                  className="flex-1 bg-[var(--color-footer)]  text-white  px-3 py-3 rounded-md text-sm"
                  title="Clear everything and start over"
                >
                  Clear Cart & Start Over
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Optional: allow editing dates directly from here */}
      {hasBooking && (
        <EditBookingDatesModal
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
};

export default BookingPage;
