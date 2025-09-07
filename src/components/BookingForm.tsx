import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import type {
  NewBooking,
  SeasonConfig,
  Availability,
  BookingStatus,
} from "../types/Types";
import gsignup from "../assets/google-signup.png";
import { useNavigate } from "react-router-dom";
import DateSelector from "./DateSelector";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import { useCart } from "../context/CartContext";
import type { Attendee } from "../types/Types";

const BookingForm = () => {
  const { user, login } = useAuth();
  const { setBooking } = useCart();

  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);

  // --- Attendees state ---
  const [attendees, setAttendees] = useState<Attendee[]>(() => [
    { fullName: (user?.displayName || "").trim(), waiverSigned: false },
  ]);

  // Keep the canonical numeric value in form.numberOfHunters,
  // but expose a separate string input value so users can clear it while typing.
  const [form, setForm] = useState({
    numberOfHunters: 1,
    dates: [] as string[],
    partyDeckDates: [] as string[],
    phone: "",
  });
  const [huntersInput, setHuntersInput] = useState<string>("1");

  // Party deck availability per date
  const [deckAvailability, setDeckAvailability] = useState<
    Record<string, boolean>
  >({});

  // Keep attendees array length in sync with numberOfHunters
  useEffect(() => {
    setAttendees((prev) => {
      const n = Math.max(1, form.numberOfHunters || 1);
      const next = [...prev];

      while (next.length < n) next.push({ fullName: "", waiverSigned: false });
      if (next.length > n) next.length = n;

      // prefill lead if missing
      if (next[0] && !next[0].fullName && user?.displayName) {
        next[0] = { ...next[0], fullName: user.displayName };
      }
      return next;
    });
  }, [form.numberOfHunters, user?.displayName]);

  // require first + last name for each attendee
  const attendeeNamesComplete =
    attendees.length === Math.max(1, form.numberOfHunters || 1) &&
    attendees.every((a) => a.fullName.trim().split(/\s+/).length >= 2);

  useEffect(() => {
    const fetchConfig = async () => {
      const config = await getSeasonConfig();
      setSeasonConfig(config);
    };
    fetchConfig();
  }, []);

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
      setForm((prev) => ({
        ...prev,
        partyDeckDates: prev.partyDeckDates.filter((d) => availability[d]),
      }));
    };
    fetchDeckAvailability();
  }, [step, form.dates]);

  // --- Phone input stays the same ---
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    let formatted = raw;
    if (raw.length > 3 && raw.length <= 6) {
      formatted = `${raw.slice(0, 3)}-${raw.slice(3)}`;
    } else if (raw.length > 6) {
      formatted = `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6, 10)}`;
    }
    setForm((prev) => ({ ...prev, phone: formatted }));
  };

  // --- Hunters: allow clearing while typing, enforce min=1 on blur or continue ---
  const handleHuntersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Accept only digits; allow '' so user can backspace to empty
    const next = e.target.value.replace(/[^\d]/g, "");
    setHuntersInput(next);

    // If there is a number present, update the canonical numeric value.
    if (next !== "") {
      const n = Math.max(1, parseInt(next, 10) || 1);
      setForm((prev) => ({ ...prev, numberOfHunters: n }));
    }
  };

  const commitHunters = () => {
    const n = Math.max(1, parseInt(huntersInput, 10) || 1);
    setForm((prev) => ({ ...prev, numberOfHunters: n }));
    // If the field was empty, snap it back to '1' visually.
    if (huntersInput === "") setHuntersInput(String(n));
  };

  const handleHuntersBlur = () => {
    commitHunters();
  };

  const togglePartyDeckDate = (date: string) => {
    setForm((prev) => {
      const idx = prev.partyDeckDates.indexOf(date);
      let newList: string[];
      if (idx >= 0) newList = prev.partyDeckDates.filter((d) => d !== date);
      else newList = [...prev.partyDeckDates, date];
      return { ...prev, partyDeckDates: newList };
    });
  };

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

  const handleNextStep = () => {
    // Make sure the hunters value is committed before moving on.
    commitHunters();
    setStep((prev) => prev + 1);
  };
  const handlePrevStep = () => setStep((prev) => prev - 1);

  const calculateTotalPrice = (): number => {
    if (!seasonConfig) return 0;
    const {
      seasonStart,
      seasonEnd,
      weekendRates,
      weekdayRate,
      partyDeckRatePerDay,
    } = seasonConfig;

    const dateObjs = form.dates
      .map((d) => {
        const [y, m, d2] = d.split("-").map(Number);
        return new Date(y, m - 1, d2);
      })
      .sort((a, b) => a.getTime() - b.getTime());

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
        perPersonTotal += weekendRates.singleDay;
        i += 1;
        continue;
      }
      perPersonTotal += weekdayRate;
      i += 1;
    }

    const partyDeckCost = partyDeckRatePerDay * form.partyDeckDates.length;
    return perPersonTotal * form.numberOfHunters + partyDeckCost;
  };

  const blockIfNamesMissing = (): boolean => {
    if (!attendeeNamesComplete) {
      alert("Please enter a full name (first & last) for each attendee.");
      setStep(3);
      return true;
    }
    return false;
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
    // Ensure hunters is committed before building the booking
    commitHunters();

    // Enforce attendee names before proceeding
    if (blockIfNamesMissing()) return;

    const price = calculateTotalPrice();
    const booking: Omit<NewBooking, "createdAt"> = {
      userId: user.uid,
      name: user.displayName || "Unknown",
      email: user.email || "No email",
      phone: form.phone,
      dates: form.dates,
      numberOfHunters: form.numberOfHunters,
      partyDeckDates: form.partyDeckDates,
      price,
      status: "pending",
      attendees: attendees.map((a) => ({
        fullName: a.fullName.trim(),
        waiverSigned: false,
      })),
    };
    setBooking(booking);
    navigate("/checkout");
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto mt-20 bg-[var(--color-card)] p-8 rounded-xl shadow-2xl text-[var(--color-text)] text-center">
        <img
          className="cursor-pointer hover:scale-105 transition-transform duration-300 mx-auto"
          onClick={login}
          src={gsignup}
          alt="Sign in with Google"
        />
      </div>
    );
  }

  const handleContinueToMerch = () => {
    if (!user) {
      alert("Please sign in with Google first.");
      return;
    }
    if (!seasonConfig) {
      alert("Season configuration not loaded. Please try again later.");
      return;
    }
    if (form.dates.length === 0) {
      alert("Please select at least one date.");
      return;
    }

    // Commit hunters before computing price or navigating
    commitHunters();

    // Enforce attendee names before proceeding to merch
    if (blockIfNamesMissing()) return;

    const price = calculateTotalPrice();

    const booking: Omit<NewBooking, "createdAt"> = {
      userId: user.uid,
      name: user.displayName || "Unknown",
      email: user.email || "No email",
      phone: form.phone,
      dates: form.dates,
      numberOfHunters: form.numberOfHunters,
      partyDeckDates: form.partyDeckDates,
      price,
      status: "pending" as BookingStatus,
      attendees: attendees.map((a) => ({
        fullName: a.fullName.trim(),
        waiverSigned: false,
      })),
    };

    setBooking(booking);
    navigate("/merch");
  };

  return (
    <div className="max-w-2xl mx-auto my-10 bg-white  p-8  shadow-2xl text-[var(--color-text)]">
      <h2 className="text-3xl font-acumin mb-0 text-center text-[var(--color-footer)]">
        {step === 1 && "Enter Party Size"}
        {step === 2 && "Choose Your Dates"}
        {step === 3 && "Review & Submit Your Booking"}
      </h2>
      <p className="mb-8 text-sm text-neutral-800 text-center">
        signed in as, {user.displayName} ({user.email})
      </p>

      <div className="flex flex-col space-y-5">
        {step === 1 && (
          <>
            <label className="flex flex-col mt-4">
              <span className="mb-1 text-sm text-[var(--color-footer)]">
                Phone Number
              </span>
              <input
                name="phone"
                type="tel"
                inputMode="numeric"
                maxLength={12}
                value={form.phone}
                onChange={handlePhoneChange}
                className="bg-neutral-200 text-[var(--color-footer)] px-4 py-3 rounded-md placeholder:text-[var(--color-footer)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                placeholder="e.g. 444-444-4444"
              />
            </label>

            <label className="flex flex-col">
              <span className="mb-1 text-sm text-[var(--color-footer)]">
                Number of Hunters
              </span>
              <input
                name="numberOfHunters"
                type="number"
                inputMode="numeric"
                min={1}
                value={huntersInput}
                onChange={handleHuntersChange}
                onBlur={handleHuntersBlur}
                className="bg-neutral-200 text-[var(--color-footer)] px-4 py-3 rounded-md placeholder:text-[var(--color-footer)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                placeholder="Enter number"
              />
              <span className="mt-1 text-xs text-[var(--color-footer)]/80">
                Must be at least 1.
              </span>
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-sm text-[var(--color-footer)] text-center">
              <DateSelector
                onSelect={(dates) => setForm((prev) => ({ ...prev, dates }))}
                seasonConfig={seasonConfig}
                numberOfHunters={form.numberOfHunters}
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="text-sm text-[var(--color-footer)] space-y-1">
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

            {/* Attendees full-name capture */}
            <div className="mt-4 border-t border-[var(--color-footer)] pt-4">
              <p className="mb-2 text-[var(--color-footer)] text-sm font-semibold">
                Enter full names for all attendees
              </p>
              <div className="space-y-2">
                {attendees.map((a, i) => (
                  <label key={i} className="block">
                    <span className="text-xs text-[var(--color-footer)]/80">
                      {i === 0 ? "Lead (you)" : `Attendee ${i + 1}`}
                    </span>
                    <input
                      type="text"
                      value={a.fullName}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAttendees((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], fullName: v };
                          return next;
                        });
                      }}
                      placeholder="First Last"
                      className="mt-1 w-full bg-neutral-200 text-[var(--color-footer)] px-4 py-3 rounded-md placeholder:text-[var(--color-footer)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                    />
                  </label>
                ))}
              </div>
              {!attendeeNamesComplete && (
                <p className="mt-2 text-xs text-red-600">
                  Please provide a full name (first & last) for each attendee.
                </p>
              )}
            </div>

            {form.dates.length > 0 && (
              <div className="mt-6 border-t border-[var(--color-footer)] pt-4">
                <p className="mb-2 text-[var(--color-footer)] text-sm font-semibold">
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
                        <span className="text-[var(--color-footer)]">
                          {formatFriendlyDate(date)}{" "}
                          {available ? "" : "(unavailable)"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {seasonConfig && (
              <div className="text-center text-[var(--color-text)] space-y-1 text-sm mt-4">
                <p className="text-lg font-semibold text-[var(--color-footer)]">
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
                <p className="text-xs italic text-[var(--color-footer)] mt-2">
                  Your hunt will be reserved after checkout is completed.
                </p>
              </div>
            )}
          </>
        )}

        <div className="flex justify-between pt-4">
          {step > 1 && step < 3 && (
            <button
              onClick={handlePrevStep}
              className="text-sm text-[var(--color-button)] font-bold hover:underline"
            >
              ← Back
            </button>
          )}

          {step < 3 ? (
            <>
              <button
                onClick={handleNextStep}
                className="ml-auto bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white px-6 py-2 text-sm font-semibold"
              >
                Continue →
              </button>
              <button
                className="bg-[var(--color-accent-gold)] text-[var(--color-footer)] font-bold shadow-md p-2 text-xs ml-3"
                onClick={handleContinueToMerch}
              >
                Shop Merch
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handlePrevStep}
                className="text-sm text-[var(--color-button)] font-bold hover:underline"
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                className="ml-auto bg-[var(--color-footer)] hover:bg-[var(--color-button-hover)] border border-[var(--color-button-hover)] font-bold text-white px-6 py-3 rounded-md text-sm tracking-wide transition-all"
              >
                Add to Cart & Proceed
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingForm;
