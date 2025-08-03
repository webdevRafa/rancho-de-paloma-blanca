import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import type { NewBooking, SeasonConfig, Availability } from "../types/Types";
import gsignup from "../assets/google-signup.png";
import { useNavigate } from "react-router-dom";
import DateSelector from "./DateSelector";
import { getSeasonConfig } from "../utils/getSeasonConfig";

const BookingForm = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);
  const [form, setForm] = useState({
    numberOfHunters: 1,
    dates: [] as string[],
    // List of dates on which the party deck is reserved. Each date
    // must correspond to a selected date in `dates`. The deck can
    // only be booked once per day.
    partyDeckDates: [] as string[],
  });

  // Track availability of the party deck for each selected date. When
  // true, the deck is available for that date. This is populated
  // whenever the user reaches the review step or the selected dates
  // change.
  const [deckAvailability, setDeckAvailability] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    const fetchConfig = async () => {
      const config = await getSeasonConfig();
      setSeasonConfig(config);
    };
    fetchConfig();
  }, []);

  // When advancing to the review step or when the selected dates change,
  // determine the availability of the party deck for each date. If the
  // deck is already booked on a day, the corresponding entry will be
  // false. Unavailable dates are automatically removed from the
  // user's partyDeckDates selection.
  useEffect(() => {
    const fetchDeckAvailability = async () => {
      if (step !== 3 || form.dates.length === 0) {
        setDeckAvailability({});
        return;
      }
      const availability: Record<string, boolean> = {};
      await Promise.all(
        form.dates.map(async (date) => {
          const ref = doc(db, "availability", date);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const data = snap.data() as Availability;
            availability[date] = !data.partyDeckBooked;
          } else {
            availability[date] = true;
          }
        })
      );
      setDeckAvailability(availability);
      // prune selections
      setForm((prev) => ({
        ...prev,
        partyDeckDates: prev.partyDeckDates.filter((d) => availability[d]),
      }));
    };
    fetchDeckAvailability();
  }, [step, form.dates]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "numberOfHunters" ? parseInt(value, 10) || 1 : value,
    }));
  };

  // Toggle a date in the partyDeckDates array. If the date is already
  // selected, remove it; otherwise add it. This allows users to
  // choose specific days for the party deck on the review step.
  const togglePartyDeckDate = (date: string) => {
    setForm((prev) => {
      const idx = prev.partyDeckDates.indexOf(date);
      let newList: string[];
      if (idx >= 0) {
        newList = prev.partyDeckDates.filter((d) => d !== date);
      } else {
        newList = [...prev.partyDeckDates, date];
      }
      return { ...prev, partyDeckDates: newList };
    });
  };

  /**
   * Convert an ISO date string (YYYY-MM-DD) into a friendly format
   * like "September 7th, 2025". Includes an ordinal suffix.
   */
  const formatFriendlyDate = (iso: string) => {
    const [yyyy, mm, dd] = iso.split("-");
    const year = Number(yyyy);
    const monthIndex = Number(mm) - 1;
    const day = Number(dd);
    const dateObj = new Date(year, monthIndex, day);
    const monthName = dateObj.toLocaleString("en-US", { month: "long" });
    const j = day % 10;
    const k = day % 100;
    let suffix = "th";
    if (j === 1 && k !== 11) suffix = "st";
    else if (j === 2 && k !== 12) suffix = "nd";
    else if (j === 3 && k !== 13) suffix = "rd";
    return `${monthName} ${day}${suffix}, ${year}`;
  };

  const handleNextStep = () => setStep((prev) => prev + 1);
  const handlePrevStep = () => setStep((prev) => prev - 1);

  /**
   * Compute the total price for the current selection. Pricing rules:
   *
   * - In-season weekend days (Fri, Sat, Sun) are eligible for bundled
   *   discounts: one day ($200), two consecutive days Fri/Sat or Sat/Sun
   *   ($350), or three consecutive days Fri/Sat/Sun ($450).
   * - Any day that falls outside of these in-season weekend bundles is
   *   priced at the standard weekday rate ($125) per person per day. This
   *   applies to all weekdays (Mon–Thu) during the season and to every
   *   day outside of the season.
   * - The party deck cost is added per selected day if included.
   */
  const calculateTotalPrice = (): number => {
    if (!seasonConfig) return 0;
    const { seasonStart, seasonEnd, weekendRates, weekdayRate } = seasonConfig;
    // Convert selected dates into Date objects and sort them
    const dateObjs = form.dates
      .map((d) => {
        const [y, m, d2] = d.split("-").map(Number);
        return new Date(y, m - 1, d2);
      })
      .sort((a, b) => a.getTime() - b.getTime());

    // Helper to convert a Date to local YYYY-MM-DD
    const toISO = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    let perPersonTotal = 0;
    let i = 0;
    while (i < dateObjs.length) {
      const current = dateObjs[i];
      const iso0 = toISO(current);
      const inSeason = iso0 >= seasonStart && iso0 <= seasonEnd;
      const dow0 = current.getDay();
      const isWeekend = inSeason && (dow0 === 5 || dow0 === 6 || dow0 === 0);
      if (isWeekend) {
        // Attempt to apply 3-day weekend combo starting on Friday
        if (dow0 === 5 && i + 2 < dateObjs.length) {
          const d1 = dateObjs[i + 1];
          const d2 = dateObjs[i + 2];
          const iso1 = toISO(d1);
          const iso2 = toISO(d2);
          const diff1 = (d1.getTime() - current.getTime()) / 86_400_000;
          const diff2 = (d2.getTime() - d1.getTime()) / 86_400_000;
          const inSeason1 = iso1 >= seasonStart && iso1 <= seasonEnd;
          const inSeason2 = iso2 >= seasonStart && iso2 <= seasonEnd;
          const dow1 = d1.getDay();
          const dow2 = d2.getDay();
          if (
            diff1 === 1 &&
            diff2 === 1 &&
            dow1 === 6 &&
            dow2 === 0 &&
            inSeason1 &&
            inSeason2
          ) {
            perPersonTotal += weekendRates.threeDayCombo;
            i += 3;
            continue;
          }
        }
        // Attempt to apply 2-day weekend combo (Fri+Sat or Sat+Sun)
        if (i + 1 < dateObjs.length) {
          const next = dateObjs[i + 1];
          const diff = (next.getTime() - current.getTime()) / 86_400_000;
          const isoNext = toISO(next);
          const inSeasonNext = isoNext >= seasonStart && isoNext <= seasonEnd;
          const dowNext = next.getDay();
          if (
            diff === 1 &&
            inSeasonNext &&
            ((dow0 === 5 && dowNext === 6) || (dow0 === 6 && dowNext === 0))
          ) {
            perPersonTotal += weekendRates.twoConsecutiveDays;
            i += 2;
            continue;
          }
        }
        // Default: single weekend day
        perPersonTotal += weekendRates.singleDay;
        i += 1;
        continue;
      }
      // Not an in-season weekend day: apply weekday/off-season rate
      perPersonTotal += weekdayRate;
      i += 1;
    }
    // Multiply by number of hunters and add party deck cost. The
    // party deck cost is applied per day selected in partyDeckDates.
    const partyDeckCost =
      seasonConfig.partyDeckRatePerDay * form.partyDeckDates.length;
    return perPersonTotal * form.numberOfHunters + partyDeckCost;
  };

  const handleSubmit = async () => {
    if (!user) {
      alert("Please sign in with Google first.");
      return;
    }
    if (!seasonConfig) {
      alert("Season configuration not loaded. Please try again later.");
      return;
    }
    const price = calculateTotalPrice();
    const booking: Omit<NewBooking, "createdAt"> = {
      userId: user.uid,
      name: user.displayName || "Unknown",
      email: user.email || "No email",
      phone: "",
      dates: form.dates,
      numberOfHunters: form.numberOfHunters,
      partyDeckDates: form.partyDeckDates,
      price,
      status: "pending",
    };
    try {
      let newBookingId = "";
      await runTransaction(db, async (transaction) => {
        for (const date of form.dates) {
          const availRef = doc(db, "availability", date);
          const availSnap = await transaction.get(availRef);
          let huntersBooked = 0;
          let partyDeckBooked = false;
          if (availSnap.exists()) {
            const data = availSnap.data() as Availability;
            huntersBooked = data.huntersBooked ?? 0;
            partyDeckBooked = data.partyDeckBooked ?? false;
          } else {
            transaction.set(availRef, {
              huntersBooked: 0,
              partyDeckBooked: false,
            });
          }
          const maxPerDay = seasonConfig.maxHuntersPerDay;
          if (huntersBooked + form.numberOfHunters > maxPerDay) {
            throw new Error(
              `Not enough spots available on ${date}. Please choose another day or reduce your party size.`
            );
          }
          // Determine if the party deck is requested for this date
          const wantsDeck = form.partyDeckDates.includes(date);
          if (wantsDeck && partyDeckBooked) {
            throw new Error(
              `The party deck is already booked on ${date}. Please deselect the party deck for this date or choose different dates.`
            );
          }
          transaction.update(availRef, {
            huntersBooked: huntersBooked + form.numberOfHunters,
            partyDeckBooked: wantsDeck ? true : partyDeckBooked,
          });
        }
        const bookingRef = doc(collection(db, "bookings"));
        newBookingId = bookingRef.id;
        transaction.set(bookingRef, {
          ...booking,
          createdAt: serverTimestamp(),
        });
      });
      alert("Booking submitted!");
      navigate(`/booking-confirmed?bookingId=${newBookingId}`);
    } catch (err: any) {
      console.error("Error booking:", err);
      alert(err.message || "Error submitting your booking. Please try again.");
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto mt-20 bg-gradient-to-r from-[var(--color-dark)] via-[var(--color-footer)] to-[var(--color-dark)] p-8 rounded-xl shadow-2xl text-[var(--color-text)] text-center">
        <img
          className="cursor-pointer hover:scale-105 transition-transform duration-300 mx-auto"
          onClick={login}
          src={gsignup}
          alt="Sign in with Google"
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-20 bg-gradient-to-r from-[var(--color-dark)] via-[var(--color-footer)] to-[var(--color-dark)] p-8 rounded-xl shadow-2xl text-[var(--color-text)]">
      <h2 className="text-3xl font-broadsheet mb-1 text-center text-[var(--color-accent-gold)]">
        {step === 1 && "Enter Party Size"}
        {step === 2 && "Choose Your Dates"}
        {step === 3 && "Review & Submit Your Booking"}
      </h2>
      <p className="mb-8 text-sm text-neutral-500 text-center">
        signed in as, {user.displayName} ({user.email})
      </p>
      <div className="flex flex-col space-y-5">
        {step === 1 && (
          <>
            <label className="flex flex-col">
              <span className="mb-1 text-sm text-[var(--color-accent-sage)]">
                Number of Hunters
              </span>
              <input
                name="numberOfHunters"
                type="number"
                min={1}
                value={form.numberOfHunters}
                onChange={handleChange}
                className="bg-[var(--color-card)] border border-[var(--color-accent-sage)] px-4 py-3 rounded-md placeholder:text-[var(--color-accent-sage)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                placeholder="Enter number"
              />
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <div className="text-sm text-[var(--color-accent-sage)] text-center">
              <DateSelector
                onSelect={(dates) => setForm((prev) => ({ ...prev, dates }))}
                seasonConfig={seasonConfig}
                numberOfHunters={form.numberOfHunters}
              />
            </div>
            {/* Party deck selection moved to step 3 */}
          </>
        )}
        {step === 3 && (
          <>
            {/* Summary of party size and selected dates */}
            <div className="text-sm text-[var(--color-accent-sage)] space-y-1">
              <p>
                Hunters: <strong>{form.numberOfHunters}</strong>
              </p>
              <p>
                Dates:{" "}
                <strong>
                  {form.dates.length === 0
                    ? "Not selected"
                    : form.dates.map((d) => formatFriendlyDate(d)).join(", ")}
                </strong>
              </p>
            </div>
            {/* Party deck selection per day */}
            {form.dates.length > 0 && (
              <div className="mt-4 border-t border-[var(--color-accent-sage)] pt-4">
                <p className="mb-2 text-[var(--color-accent-sage)] text-sm font-semibold">
                  Add Party Deck ($500/day):
                </p>
                <div className="space-y-2">
                  {form.dates.map((date) => {
                    const available = deckAvailability[date];
                    const checked = form.partyDeckDates.includes(date);
                    return (
                      <label
                        key={date}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          disabled={!available}
                          checked={checked}
                          onChange={() => togglePartyDeckDate(date)}
                          className="accent-[var(--color-accent-gold)]"
                        />
                        <span className="text-[var(--color-accent-sage)]">
                          {formatFriendlyDate(date)}{" "}
                          {available ? "" : "(unavailable)"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Pricing summary with party deck cost breakdown */}
            {seasonConfig && (
              <div className="text-center text-[var(--color-text)] space-y-1 text-sm mt-4">
                <p className="text-lg font-semibold text-[var(--color-text)]">
                  Total Price: ${calculateTotalPrice()}
                </p>
                {form.partyDeckDates.length > 0 && (
                  <p>
                    Party Deck: ${seasonConfig.partyDeckRatePerDay} ×{" "}
                    {form.partyDeckDates.length} = $
                    {seasonConfig.partyDeckRatePerDay *
                      form.partyDeckDates.length}
                  </p>
                )}
              </div>
            )}
          </>
        )}
        <div className="flex justify-between pt-4">
          {step > 1 && (
            <button
              onClick={handlePrevStep}
              className="text-sm text-[var(--color-accent-gold)] hover:underline"
            >
              ← Back
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={handleNextStep}
              className="ml-auto bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white px-6 py-2 rounded-md text-sm font-semibold"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="ml-auto bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] border border-[var(--color-button-hover)] font-bold text-[var(--color-footer)] px-6 py-3 rounded-md text-sm tracking-wide transition-all"
            >
              Submit Booking
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingForm;
