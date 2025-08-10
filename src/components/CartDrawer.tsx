// components/CartDrawer.tsx
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import EditBookingDatesModal from "./EditBookingDatesModal";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { getSeasonConfig } from "../utils/getSeasonConfig";

type AvailabilityDoc = { huntersBooked?: number; partyDeckBooked?: boolean };

const PARTY_DECK_COST = 500;

const CartDrawer = () => {
  const { booking, merchItems, setBooking } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const navigate = useNavigate();

  const hasBooking = !!booking && booking.dates?.length > 0;
  const hasMerch = Object.keys(merchItems).length > 0;

  // ---- Hunters input (editable in-drawer) ----
  const [huntersInput, setHuntersInput] = useState<string>(
    String(booking?.numberOfHunters ?? 1)
  );

  useEffect(() => {
    // Keep input in sync if booking changes elsewhere
    setHuntersInput(String(booking?.numberOfHunters ?? 1));
  }, [booking?.numberOfHunters]);

  const handleHuntersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^\d]/g, "");
    setHuntersInput(digits);
    // update booking live as they type, but coerce to at least 1 if non-empty
    if (digits !== "" && booking) {
      const n = Math.max(1, parseInt(digits, 10) || 1);
      setBooking({ ...booking, numberOfHunters: n });
    }
  };

  const commitHunters = () => {
    const n = Math.max(1, parseInt(huntersInput, 10) || 1);
    if (booking) setBooking({ ...booking, numberOfHunters: n });
    if (huntersInput === "") setHuntersInput(String(n));
  };

  // ---- Load season config for max capacity ----
  const [maxCapacity, setMaxCapacity] = useState<number>(75);
  useEffect(() => {
    (async () => {
      try {
        const cfg = await getSeasonConfig();
        if (cfg?.maxHuntersPerDay) setMaxCapacity(cfg.maxHuntersPerDay);
      } catch {
        // fall back to 75
      }
    })();
  }, []);

  // ---- Fetch availability for the selected dates ----
  const [availByDate, setAvailByDate] = useState<Record<string, number>>({}); // {date: huntersBooked}
  useEffect(() => {
    const load = async () => {
      if (!hasBooking) {
        setAvailByDate({});
        return;
      }
      const map: Record<string, number> = {};
      await Promise.all(
        booking!.dates.map(async (iso) => {
          try {
            const snap = await getDoc(doc(db, "availability", iso));
            if (snap.exists()) {
              const data = snap.data() as AvailabilityDoc;
              map[iso] = data.huntersBooked ?? 0;
            } else {
              map[iso] = 0; // missing doc = no bookings yet
            }
          } catch {
            map[iso] = 0;
          }
        })
      );
      setAvailByDate(map);
    };
    load();
  }, [hasBooking, booking?.dates]);

  // ---- Compute capacity violations for current hunters/dates ----
  const violatingDates = useMemo(() => {
    if (!hasBooking) return [] as string[];
    const hunters = booking!.numberOfHunters ?? 1;
    return booking!.dates.filter((d) => {
      const booked = availByDate[d] ?? 0;
      return booked + hunters > maxCapacity;
    });
  }, [
    hasBooking,
    booking?.dates,
    booking?.numberOfHunters,
    availByDate,
    maxCapacity,
  ]);

  const hasViolations = violatingDates.length > 0;

  // ---- Totals (same rules used on Checkout) ----
  const bookingTotal = useMemo(() => {
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

      // Fri-Sat-Sun 3-day combo
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

      // Fri+Sat or Sat+Sun 2-day combo
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

      // Single weekend day vs weekday
      if ([5, 6, 0].includes(dow)) perPersonTotal += baseWeekendRates.singleDay;
      else perPersonTotal += weekdayRate;

      i++;
    }

    const partyDeckCost = (deckDays?.length || 0) * PARTY_DECK_COST;
    return perPersonTotal * hunters + partyDeckCost;
  }, [
    hasBooking,
    booking?.dates,
    booking?.numberOfHunters,
    booking?.partyDeckDates,
  ]);

  const merchTotal = useMemo(
    () =>
      Object.values(merchItems).reduce(
        (acc, item) => acc + item.product.price * item.quantity,
        0
      ),
    [merchItems]
  );

  const total = bookingTotal + merchTotal;

  if (!hasBooking && !hasMerch) return null;

  const huntLabel =
    hasBooking && booking!.dates.length > 1
      ? "Selected Hunts"
      : "Selected Hunt";

  const handleGoToCheckout = () => {
    // Commit hunters to a valid value before navigating
    commitHunters();
    if (hasViolations) return;
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

                    {/* Hunters editor */}
                    <div className="mt-2 mb-3">
                      <label className="text-xs font-semibold block mb-1">
                        Number of Hunters
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const current = Math.max(
                              1,
                              parseInt(huntersInput || "1", 10) || 1
                            );
                            const next = Math.max(1, current - 1);
                            setHuntersInput(String(next));
                            if (booking)
                              setBooking({ ...booking, numberOfHunters: next });
                          }}
                          className="px-3 py-1 rounded bg-white border"
                          aria-label="Decrease hunters"
                        >
                          –
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={huntersInput}
                          onChange={handleHuntersChange}
                          onBlur={commitHunters}
                          className="w-20 px-2 py-1 rounded border text-black"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const current = Math.max(
                              1,
                              parseInt(huntersInput || "1", 10) || 1
                            );
                            const next = current + 1;
                            setHuntersInput(String(next));
                            if (booking)
                              setBooking({ ...booking, numberOfHunters: next });
                          }}
                          className="px-3 py-1 rounded bg-white border"
                          aria-label="Increase hunters"
                        >
                          +
                        </button>
                      </div>
                      {hasViolations && (
                        <p className="text-xs text-red-600 mt-2">
                          Some dates exceed the daily capacity of {maxCapacity}.
                          Please edit your dates or reduce hunters to continue.
                        </p>
                      )}
                    </div>

                    <ul className="text-sm list-disc ml-5 space-y-1">
                      {/* Dates with per-day warnings */}
                      {booking!.dates.map((d) => {
                        const booked = availByDate[d] ?? 0;
                        const wouldBe =
                          booked + (booking!.numberOfHunters ?? 1);
                        const over = wouldBe > maxCapacity;
                        return (
                          <li key={d} className="flex items-start gap-2">
                            <span>• {d}</span>
                            {over && (
                              <span className="ml-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                                Over capacity. Please pick a different day.
                              </span>
                            )}
                          </li>
                        );
                      })}
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

                <div className="mt-3 flex items-center justify-between">
                  <p className="font-bold text-lg bg-white px-2 rounded-sm shadow-sm">
                    Total: ${total}
                  </p>
                  <button
                    onClick={handleGoToCheckout}
                    disabled={hasViolations}
                    title={
                      hasViolations
                        ? "Fix capacity conflicts before continuing to checkout."
                        : undefined
                    }
                    className={`ml-3 text-center py-3 px-4 rounded-md transition font-semibold ${
                      hasViolations
                        ? "bg-gray-400 text-white cursor-not-allowed"
                        : "bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white"
                    }`}
                  >
                    Go to Checkout
                  </button>
                </div>
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
