// components/CartDrawer.tsx
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import EditBookingDatesModal from "./EditBookingDatesModal";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import { formatLongDate } from "../utils/formatDate";
import { RiShoppingCartFill } from "react-icons/ri";

type AvailabilityDoc = { huntersBooked?: number; partyDeckBooked?: boolean };

// Shape helper that tolerates both the nested weekendRates
// (like BookingForm uses) and any prior flattened fields.
type RawSeasonConfig = {
  seasonStart?: string;
  seasonEnd?: string;
  maxHuntersPerDay?: number;

  // current canonical fields
  weekdayRate?: number;
  offSeasonRate?: number;
  partyDeckRatePerDay?: number;
  weekendRates?: {
    singleDay?: number;
    twoConsecutiveDays?: number;
    threeDayCombo?: number;
  };

  // legacy/alt keys we’ll accept as fallback
  weekendSingleDayRate?: number;
  twoDayConsecutiveRate?: number;
  threeDayFriSatSunRate?: number;
  partyDeckPrice?: number;
};

// Normalize any seasonConfig into a single, consistent object.
const normalizeConfig = (cfg: RawSeasonConfig | null | undefined) => {
  const single =
    cfg?.weekendRates?.singleDay ?? cfg?.weekendSingleDayRate ?? 125; // default single day

  const twoDay =
    cfg?.weekendRates?.twoConsecutiveDays ?? cfg?.twoDayConsecutiveRate ?? 350;

  const threeDay =
    cfg?.weekendRates?.threeDayCombo ?? cfg?.threeDayFriSatSunRate ?? 450;

  const weekday = cfg?.weekdayRate ?? 125;
  const offSeason = cfg?.offSeasonRate ?? 125;
  const partyDeck = cfg?.partyDeckRatePerDay ?? cfg?.partyDeckPrice ?? 500;

  const maxCap = cfg?.maxHuntersPerDay ?? 75;

  return {
    seasonStart: cfg?.seasonStart,
    seasonEnd: cfg?.seasonEnd,
    maxHuntersPerDay: maxCap,
    weekdayRate: weekday,
    offSeasonRate: offSeason,
    partyDeckPerDay: partyDeck,
    weekend: {
      singleDay: single,
      twoConsecutiveDays: twoDay,
      threeDayCombo: threeDay,
    },
  };
};

const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};
const isISO = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

const isInSeason = (
  d: Date,
  cfg: { seasonStart?: string; seasonEnd?: string }
) => {
  if (!isISO(cfg.seasonStart) || !isISO(cfg.seasonEnd)) return true;
  const t = new Date(d).setHours(0, 0, 0, 0);
  const start = toDate(cfg.seasonStart!).setHours(0, 0, 0, 0);
  const end = toDate(cfg.seasonEnd!).setHours(0, 0, 0, 0);
  return t >= start && t <= end;
};

const CartDrawer = () => {
  const { booking, merchItems, setBooking, addOrUpdateMerchItem, clearCart } =
    useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const navigate = useNavigate();

  const hasBooking = !!booking && booking.dates?.length > 0;
  const hasMerch = Object.keys(merchItems).length > 0;

  // Load live season config and normalize it
  const [normCfg, setNormCfg] = useState<ReturnType<
    typeof normalizeConfig
  > | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const raw = (await getSeasonConfig()) as RawSeasonConfig;
        setNormCfg(normalizeConfig(raw));
      } catch {
        setNormCfg(
          normalizeConfig({
            weekdayRate: 125,
            offSeasonRate: 125,
            partyDeckRatePerDay: 500,
            weekendRates: {
              singleDay: 125,
              twoConsecutiveDays: 350,
              threeDayCombo: 450,
            },
            maxHuntersPerDay: 75,
          })
        );
      }
    })();
  }, []);

  // Party size draft -> validate -> commit
  const [huntersDraft, setHuntersDraft] = useState<string>("");
  useEffect(() => {
    setHuntersDraft(String(booking?.numberOfHunters ?? 1));
  }, [booking?.numberOfHunters]);

  const maxCapacity = normCfg?.maxHuntersPerDay ?? 75;

  // Availability lookups
  const [availByDate, setAvailByDate] = useState<Record<string, number>>({});
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
            map[iso] = snap.exists()
              ? (snap.data() as AvailabilityDoc).huntersBooked ?? 0
              : 0;
          } catch {
            map[iso] = 0;
          }
        })
      );
      setAvailByDate(map);
    };
    load();
  }, [hasBooking, booking?.dates]);

  const draftHuntersNum = useMemo(
    () => Math.max(1, parseInt(huntersDraft || "1", 10) || 1),
    [huntersDraft]
  );

  const violatingDates = useMemo(() => {
    if (!hasBooking) return [] as string[];
    return booking!.dates.filter(
      (d) => (availByDate[d] ?? 0) + draftHuntersNum > maxCapacity
    );
  }, [hasBooking, booking?.dates, draftHuntersNum, availByDate, maxCapacity]);

  const hasViolations = violatingDates.length > 0;

  const applyHunters = () => {
    if (!booking) return;
    if (hasViolations) return;
    setBooking({ ...booking, numberOfHunters: draftHuntersNum });
  };

  // ---- Pricing driven by seasonConfig (no hardcoded $200 anymore) ----
  const computePerPersonTotal = (isoDates: string[]) => {
    if (!normCfg || !isoDates.length) return 0;

    const { seasonStart, seasonEnd, weekdayRate, offSeasonRate, weekend } =
      normCfg;

    const dates = isoDates
      .map((d) => {
        const [y, m, dd] = d.split("-").map(Number);
        const obj = new Date(y, (m ?? 1) - 1, dd ?? 1);
        obj.setHours(0, 0, 0, 0);
        return obj;
      })
      .sort((a, b) => a.getTime() - b.getTime());

    let total = 0;
    let i = 0;

    while (i < dates.length) {
      const cur = dates[i];
      const inSeasonNow = isInSeason(cur, { seasonStart, seasonEnd });
      const dow = cur.getDay();

      // Off-season: flat per day
      if (!inSeasonNow) {
        total += offSeasonRate;
        i++;
        continue;
      }

      // 3-day Fri–Sat–Sun combo
      if (dow === 5 && i + 2 < dates.length) {
        const d1 = dates[i + 1];
        const d2 = dates[i + 2];
        const diff1 = (d1.getTime() - cur.getTime()) / 86400000;
        const diff2 = (d2.getTime() - d1.getTime()) / 86400000;
        if (
          diff1 === 1 &&
          diff2 === 1 &&
          d1.getDay() === 6 &&
          d2.getDay() === 0 &&
          isInSeason(d1, { seasonStart, seasonEnd }) &&
          isInSeason(d2, { seasonStart, seasonEnd })
        ) {
          total += weekend.threeDayCombo;
          i += 3;
          continue;
        }
      }

      // 2-day Fri–Sat or Sat–Sun
      if (i + 1 < dates.length) {
        const next = dates[i + 1];
        const diff = (next.getTime() - cur.getTime()) / 86400000;
        const dowNext = next.getDay();
        if (
          diff === 1 &&
          isInSeason(next, { seasonStart, seasonEnd }) &&
          ((dow === 5 && dowNext === 6) || (dow === 6 && dowNext === 0))
        ) {
          total += weekend.twoConsecutiveDays;
          i += 2;
          continue;
        }
      }

      // Single in-season day — **this now uses weekend.singleDay (125) even on weekends**
      const isWeekend = dow === 5 || dow === 6 || dow === 0;
      total += isWeekend ? weekend.singleDay : weekdayRate;
      i++;
    }

    return total;
  };

  const bookingTotal = useMemo(() => {
    if (!hasBooking) return 0;
    const perPerson = computePerPersonTotal(booking!.dates);
    const partyDeckDays = booking!.partyDeckDates || [];
    const partyDeckCost =
      (normCfg?.partyDeckPerDay ?? 500) * (partyDeckDays?.length || 0);
    return perPerson * (booking!.numberOfHunters || 0) + partyDeckCost;
  }, [
    hasBooking,
    booking?.dates,
    booking?.numberOfHunters,
    booking?.partyDeckDates,
    normCfg,
  ]);

  // --- Merch stock & totals (unchanged) ---
  const [merchStock, setMerchStock] = useState<Record<string, number | null>>(
    {}
  );
  const [merchErrors, setMerchErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const loadStock = async () => {
      const entries = Object.values(merchItems || {}) as any[];
      const next: Record<string, number | null> = {};
      await Promise.all(
        entries.map(async (item: any) => {
          const id = item?.product?.id;
          if (!id) return;
          try {
            const snap = await getDoc(doc(db, "products", id));
            if (snap.exists()) {
              const stock = (snap.data() as any)?.stock;
              next[id] = typeof stock === "number" ? stock : null;
            } else {
              next[id] = null;
            }
          } catch {
            next[id] = null;
          }
        })
      );
      setMerchStock(next);
    };
    loadStock();
  }, [JSON.stringify(merchItems)]);

  useEffect(() => {
    const errs: Record<string, string> = {};
    Object.values(merchItems || {}).forEach((item: any) => {
      const id = item?.product?.id;
      if (!id) return;
      const qty = Number(item?.quantity || 0);
      const stock = merchStock[id];
      if (typeof stock === "number") {
        if (stock <= 0) errs[id] = "Out of stock";
        else if (qty > stock) errs[id] = `Only ${stock} left`;
      }
    });
    setMerchErrors(errs);
  }, [JSON.stringify(merchItems), merchStock]);

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

  const hasMerchViolations = Object.keys(merchErrors).length > 0;

  const handleGoToCheckout = () => {
    if (violatingDates.length || hasMerchViolations) return;
    setIsOpen(false);
    navigate("/checkout");
  };

  const handleClearCart = () => {
    clearCart();
    setIsOpen(false);
  };

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-50 pointer-events-none">
        <AnimatePresence>
          {isOpen ? (
            <>
              <div
                className="fixed inset-0 bg-black/30 backdrop-blur-xs z-40"
                onClick={() => setIsOpen(false)}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ duration: 0.4 }}
                className="bg-neutral-100 max-w-2xl mx-auto rounded-t-lg shadow-xl pointer-events-auto z-50 relative"
              >
                <div className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold font-acumin">
                      Cart Summary
                    </h3>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleClearCart}
                        className="text-xs font-bold text-red-700 hover:underline"
                      >
                        Clear cart
                      </button>
                      <button
                        onClick={() => setIsOpen(false)}
                        className="text-sm font-bold text-[var(--color-background)] hover:underline"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  {hasBooking && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm mb-1">
                          {huntLabel}
                        </p>
                        <button
                          onClick={() => setEditOpen(true)}
                          className="text-xs underline text-[var(--color-background)] hover:text-black"
                        >
                          Edit dates
                        </button>
                      </div>

                      {/* Party size editor */}
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
                                parseInt(huntersDraft || "1", 10) || 1
                              );
                              setHuntersDraft(String(Math.max(1, current - 1)));
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
                            value={huntersDraft}
                            onChange={(e) =>
                              setHuntersDraft(
                                e.target.value.replace(/[^\d]/g, "")
                              )
                            }
                            onBlur={() => {
                              if (huntersDraft === "") setHuntersDraft("1");
                            }}
                            className="w-20 px-2 py-1 rounded border text-black"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const current = Math.max(
                                1,
                                parseInt(huntersDraft || "1", 10) || 1
                              );
                              setHuntersDraft(String(current + 1));
                            }}
                            className="px-3 py-1 rounded bg-white border"
                            aria-label="Increase hunters"
                          >
                            +
                          </button>

                          <button
                            type="button"
                            onClick={applyHunters}
                            disabled={hasViolations}
                            className={`ml-2 px-3 py-1 rounded text-white text-xs font-semibold ${
                              hasViolations
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-[var(--color-button)] hover:bg-[var(--color-button-hover)]"
                            }`}
                            title={
                              hasViolations
                                ? "One or more days exceed capacity."
                                : "Apply"
                            }
                          >
                            Apply
                          </button>
                        </div>
                      </div>

                      {/* Dates list with per-day inline warnings */}
                      <ul className="text-sm ml-1 space-y-1">
                        {booking!.dates.map((d) => {
                          const over =
                            (availByDate[d] ?? 0) + draftHuntersNum >
                            maxCapacity;
                          return (
                            <li key={d} className="flex items-center gap-2">
                              <span className="bg-[var(--color-footer)] text-white p-1 shadow-md">
                                {formatLongDate(d)}
                              </span>
                              {over && (
                                <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                                  Exceeds limit — pick a different day
                                </span>
                              )}
                            </li>
                          );
                        })}
                        <li className="mt-3 bg-[var(--color-button)]/10 max-w-[140px] p-1">
                          Hunters: <strong>{booking!.numberOfHunters}</strong>
                        </li>
                        <p className="bg-[var(--color-button)]/10 max-w-[120px] p-1 mb-2">
                          Days: <strong>{booking!.dates.length}</strong>
                        </p>
                        {!!booking!.partyDeckDates?.length && (
                          <li>
                            Party Deck: {booking!.partyDeckDates.length} × $
                            {normCfg?.partyDeckPerDay ?? 500}
                          </li>
                        )}
                        <li className="bg-white max-w-[220px] text-[var(--color-footer)] p-1 shadow-sm text-md font-bold">
                          Booking Subtotal: ${bookingTotal}
                        </li>
                      </ul>
                    </div>
                  )}

                  {hasMerch && (
                    <div className="mb-4">
                      <p className="font-semibold text-sm mb-2">Merchandise</p>
                      <ul className="space-y-3">
                        {Object.entries(merchItems).map(([id, item]: any) => {
                          const product = item.product || {};
                          const qty = Number(item.quantity || 0);
                          const unit = Number(product.price || 0);
                          const img = product.imageUrl || product.image;
                          const stock = merchStock[product.id as string];
                          const err = merchErrors[product.id as string];
                          const canInc =
                            typeof stock === "number" ? qty < stock : true;

                          const dec = () => {
                            const next = Math.max(0, qty - 1);
                            addOrUpdateMerchItem(product, next);
                          };
                          const inc = () => {
                            if (!canInc) return;
                            addOrUpdateMerchItem(product, qty + 1);
                          };
                          const remove = () => addOrUpdateMerchItem(product, 0);

                          return (
                            <li
                              key={id}
                              className="flex items-center gap-3 bg-white rounded-lg p-2 text-[var(--color-footer)]"
                            >
                              {img ? (
                                <img
                                  src={img}
                                  alt={product.name}
                                  className="w-12 h-12 rounded object-cover"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded bg-gray-200" />
                              )}

                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div className="font-semibold">
                                    {product.name}
                                  </div>
                                  <div className="text-sm">${unit * qty}</div>
                                </div>

                                <div className="mt-1 flex items-center gap-2">
                                  <button
                                    className="px-2 py-1 border rounded"
                                    onClick={dec}
                                    aria-label="Decrease quantity"
                                  >
                                    –
                                  </button>

                                  <input
                                    type="number"
                                    min={0}
                                    value={qty}
                                    onChange={(e) => {
                                      const val = Math.max(
                                        0,
                                        parseInt(e.target.value || "0", 10) || 0
                                      );
                                      const capped =
                                        typeof stock === "number"
                                          ? Math.min(val, stock)
                                          : val;
                                      addOrUpdateMerchItem(product, capped);
                                    }}
                                    className="w-14 px-1 py-0.5 border rounded text-center"
                                  />

                                  <button
                                    className={
                                      "px-2 py-1 border rounded " +
                                      (!canInc
                                        ? "opacity-40 cursor-not-allowed"
                                        : "")
                                    }
                                    onClick={inc}
                                    disabled={!canInc}
                                    aria-label="Increase quantity"
                                    title={
                                      !canInc && typeof stock === "number"
                                        ? `Only ${stock} in stock`
                                        : ""
                                    }
                                  >
                                    +
                                  </button>

                                  <button
                                    className="ml-2 text-xs underline"
                                    onClick={remove}
                                  >
                                    Remove
                                  </button>
                                </div>

                                {err && (
                                  <div className="text-xs text-red-700 mt-1">
                                    {err}. Please reduce quantity to proceed.
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      <p className="mt-3 bg-white max-w-[220px] text-[var(--color-footer)] p-1 shadow-sm text-sm font-bold">
                        Merch Subtotal: ${merchTotal}
                      </p>

                      {Object.keys(merchErrors).length > 0 && (
                        <div className="mt-3 rounded-md border border-red-300 bg-red-50 text-red-700 text-sm p-2">
                          Please adjust the highlighted items to match available
                          stock before checkout.
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <p className="font-bold text-lg bg-[var(--color-accent-gold)] px-2 rounded-sm shadow-sm">
                      Total: ${total}
                    </p>
                    <button
                      onClick={handleGoToCheckout}
                      disabled={hasViolations || hasMerchViolations}
                      className={`ml-3 text-center py-3 px-4 rounded-md transition font-semibold ${
                        hasViolations || hasMerchViolations
                          ? "bg-gray-400 text-white cursor-not-allowed"
                          : "bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white"
                      }`}
                    >
                      Go to Checkout
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          ) : (
            <motion.button
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              transition={{ duration: 0.3 }}
              onClick={() => setIsOpen(true)}
              className="pointer-events-auto flex items-center gap-3 mx-auto bg-[var(--color-accent-gold)] text-[var(--color-footer)] text-sm font-bold py-3 px-6 rounded-t-lg shadow-lg"
            >
              <RiShoppingCartFill className="size-10" />
              (${total})
            </motion.button>
          )}
        </AnimatePresence>
      </div>

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
