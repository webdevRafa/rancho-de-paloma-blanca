// components/CartDrawer.tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "../context/CartContext";
import { Link } from "react-router-dom";

const CartDrawer = () => {
  const {
    booking,
    merchItems,
    calculateBookingTotal,
    numberOfHunters,
    selectedDates,
  } = useCart();

  const [isOpen, setIsOpen] = useState(false);

  const hasBooking = booking || selectedDates.length > 0;
  const hasMerch = Object.keys(merchItems).length > 0;

  const bookingTotal = calculateBookingTotal?.() ?? 0;
  const merchTotal = Object.values(merchItems).reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );
  const total = bookingTotal + merchTotal;

  if (!hasBooking && !hasMerch) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 pointer-events-none">
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.4 }}
            className="bg-[var(--color-card)] border-t-2 border-[var(--color-accent-gold)] text-[var(--color-text)] max-w-3xl mx-auto rounded-t-xl shadow-xl pointer-events-auto"
          >
            <div className="p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold">Cart Summary</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-sm text-[var(--color-accent-gold)] hover:underline"
                >
                  Close
                </button>
              </div>

              {hasBooking && (
                <div className="mb-4">
                  <p className="font-semibold text-sm mb-1">Booking</p>
                  <ul className="text-sm list-disc ml-5 space-y-1">
                    <li>
                      Dates: {(booking?.dates || selectedDates).join(", ")}
                    </li>
                    <li>
                      Hunters: {booking?.numberOfHunters || numberOfHunters}
                    </li>
                    <li>Subtotal: ${bookingTotal}</li>
                  </ul>
                </div>
              )}

              {hasMerch && (
                <div className="mb-4">
                  <p className="font-semibold text-sm mb-1">Merchandise</p>
                  <ul className="text-sm list-disc ml-5 space-y-1">
                    {Object.entries(merchItems).map(([id, item]) => (
                      <li key={id}>
                        {item.product.name} × {item.quantity} = $
                        {item.product.price * item.quantity}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">Merch Subtotal: ${merchTotal}</p>
                </div>
              )}

              <p className="mt-2 font-bold text-lg">Total: ${total}</p>

              <Link
                to="/checkout"
                className="mt-4 block text-center bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white py-3 rounded-md transition w-full font-semibold"
              >
                Go to Checkout
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.button
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ duration: 0.3 }}
            onClick={() => setIsOpen(true)}
            className="pointer-events-auto mx-auto block bg-[var(--color-accent-gold)] text-[var(--color-footer)] text-sm font-bold py-3 px-6 rounded-t-lg shadow-lg"
          >
            View Cart (${total})
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CartDrawer;
