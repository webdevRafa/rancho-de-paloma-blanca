// components/CartDrawer.tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import EditBookingDatesModal from "./EditBookingDatesModal";

const CartDrawer = () => {
  const { booking, merchItems } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const navigate = useNavigate();

  const hasBooking = !!booking && booking.dates?.length > 0;
  const hasMerch = Object.keys(merchItems).length > 0;

  const PARTY_DECK_COST = 500;

  // Local booking total (same rules used on Checkout)
  const bookingTotal = (() => {
    if (!hasBooking) return 0;
    const dates = booking!.dates;
    const hunters = booking!.numberOfHunters || 0;
    const deckDays = booking!.partyDeckDates || [];

    const weekdayRate = 125;
    const baseWeekendRates = {
      singleDay: 200,
      twoConsecutiveDays: 350,
      threeDayCombo: 450,
    };

    const dateObjs = dates
      .map((d) => {
        const [y, m, d2] = d.split("-").map(Number);
        return new Date(y, m - 1, d2);
      })
      .sort((a, b) => a.getTime() - b.getTime());

    let perPersonTotal = 0;
    let i = 0;
    while (i < dateObjs.length) {
      const current = dateObjs[i];
      const dow = current.getDay();

      if (dow === 5 && i + 2 < dateObjs.length) {
        const d1 = dateObjs[i + 1];
        const d2 = dateObjs[i + 2];
        const diff1 = (d1.getTime() - current.getTime()) / 86400000;
        const diff2 = (d2.getTime() - d1.getTime()) / 86400000;
        if (
          diff1 === 1 &&
          diff2 === 1 &&
          d1.getDay() === 6 &&
          d2.getDay() === 0
        ) {
          perPersonTotal += baseWeekendRates.threeDayCombo;
          i += 3;
          continue;
        }
      }

      if (
        i + 1 < dateObjs.length &&
        ((dow === 5 && dateObjs[i + 1].getDay() === 6) ||
          (dow === 6 && dateObjs[i + 1].getDay() === 0))
      ) {
        const next = dateObjs[i + 1];
        const diff = (next.getTime() - current.getTime()) / 86400000;
        if (diff === 1) {
          perPersonTotal += baseWeekendRates.twoConsecutiveDays;
          i += 2;
          continue;
        }
      }

      if ([5, 6, 0].includes(dow)) perPersonTotal += baseWeekendRates.singleDay;
      else perPersonTotal += weekdayRate;

      i++;
    }

    const partyDeckCost = (deckDays?.length || 0) * PARTY_DECK_COST;
    return perPersonTotal * hunters + partyDeckCost;
  })();

  const merchTotal = Object.values(merchItems).reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );

  const total = bookingTotal + merchTotal;

  if (!hasBooking && !hasMerch) return null;

  const huntLabel =
    hasBooking && booking!.dates.length > 1
      ? "Selected Hunts"
      : "Selected Hunt";

  const handleGoToCheckout = () => {
    setIsOpen(false);
    navigate("/checkout");
  };

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-50 pointer-events-none">
        <AnimatePresence>
          {isOpen ? (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.4 }}
              className="bg-neutral-100 max-w-2xl mx-auto rounded-t-lg shadow-xl pointer-events-auto"
            >
              <div className="p-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold">Cart Summary</h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-sm font-bold text-[var(--color-background)] hover:underline"
                  >
                    Close
                  </button>
                </div>

                {hasBooking && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm mb-1">{huntLabel}</p>
                      <button
                        onClick={() => setEditOpen(true)}
                        className="text-xs underline text-[var(--color-background)] hover:text-black"
                      >
                        Edit dates
                      </button>
                    </div>
                    <ul className="text-sm list-disc ml-5 space-y-1">
                      <li>Dates: {booking!.dates.join(", ")}</li>
                      <li>Hunters: {booking!.numberOfHunters}</li>
                      {!!booking!.partyDeckDates?.length && (
                        <li>
                          Party Deck: {booking!.partyDeckDates.length} × $
                          {PARTY_DECK_COST}
                        </li>
                      )}
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

                <p className="mt-2 font-bold text-lg bg-white max-w-[140px] px-2 rounded-sm shadow-sm">
                  Total: ${total}
                </p>

                <button
                  onClick={handleGoToCheckout}
                  className="mt-4 block text-center bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white py-3 rounded-md transition w-full font-semibold"
                >
                  Go to Checkout
                </button>
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

      {/* Modal lives outside the drawer for proper stacking */}
      {hasBooking && (
        <EditBookingDatesModal
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
};

export default CartDrawer;
