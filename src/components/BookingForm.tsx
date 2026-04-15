import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import type {
  NewBooking,
  SeasonConfig,
  PricingWindow,
  Availability,
} from "../types/Types";
import gsignup from "../assets/google-signup.png";
import { useNavigate } from "react-router-dom";
import DateSelector from "./DateSelector";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import { useCart } from "../context/CartContext";
import type { Attendee } from "../types/Types";
import { motion, AnimatePresence } from "framer-motion";
import PartyDeck from "./PartyDeck";
import { MdOutlinePreview } from "react-icons/md";
import backTheBlueFlyer from "../assets/images/btb_2026.png";

const BookingForm = () => {
  const { user, login } = useAuth();
  const { setBooking } = useCart();

  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);
  const [showPartyDeck, setShowPartyDeck] = useState(false);
  const BACK_THE_BLUE_DATE = "2026-10-03";

  const [showBackTheBlueDisclaimer, setShowBackTheBlueDisclaimer] =
    useState(false);
  const [showBackTheBlueFlyerViewer, setShowBackTheBlueFlyerViewer] =
    useState(false);
  const [backTheBlueAccepted, setBackTheBlueAccepted] = useState(false);
  const [showPartyDeckDisclaimer, setShowPartyDeckDisclaimer] = useState(false);
  const [partyDeckDisclaimerAccepted, setPartyDeckDisclaimerAccepted] =
    useState(false);
  const [pendingPartyDeckDate, setPendingPartyDeckDate] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (showPartyDeck) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showPartyDeck]);

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

  // 1) Helper – format 10 digits as 555-555-1234 (same style you use while typing)
  const formatDashedPhone = (digits: string) => {
    const d = digits.replace(/\D/g, "").slice(0, 10);
    if (d.length > 6)
      return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 10)}`;
    if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return d;
  };

  // 2) Prefill once from Firestore if we have a saved phone and the form is empty
  useEffect(() => {
    if (!user || form.phone) return; // don’t overwrite what the user already typed
    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists() || cancelled) return;

        const u = snap.data() as any;
        const digits = String(u?.phone || "").replace(/\D/g, "");
        if (digits) {
          setForm((prev) => ({ ...prev, phone: formatDashedPhone(digits) }));
        }
      } catch {
        // non-blocking
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, form.phone]);

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
      console.log("BookingForm seasonConfig:", config);
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
          try {
            const ref = doc(db, "availability", date);
            const snap = await getDoc(ref);

            if (snap.exists()) {
              const data = snap.data() as Availability;

              // Only available when explicitly NOT booked
              availability[date] = data.partyDeckBooked !== true;
            } else {
              // Safer default: if the doc is missing, do NOT allow booking
              availability[date] = false;
            }
          } catch (error) {
            console.error(
              "Failed to fetch party deck availability for",
              date,
              error
            );

            // Fail closed so we never accidentally oversell the party deck
            availability[date] = false;
          }
        })
      );

      setDeckAvailability(availability);

      setForm((prev) => ({
        ...prev,
        partyDeckDates: prev.partyDeckDates.filter(
          (d) => availability[d] === true
        ),
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

  const applyPartyDeckToggle = (date: string) => {
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

  const togglePartyDeckDate = (date: string) => {
    const alreadySelected = form.partyDeckDates.includes(date);

    // Unchecking should always happen immediately
    if (alreadySelected) {
      applyPartyDeckToggle(date);
      return;
    }

    // If already accepted once, allow future checks without showing again
    if (partyDeckDisclaimerAccepted) {
      applyPartyDeckToggle(date);
      return;
    }

    // First-time check: show disclaimer modal
    setPendingPartyDeckDate(date);
    setShowPartyDeckDisclaimer(true);
  };

  const confirmPartyDeckDisclaimer = () => {
    if (pendingPartyDeckDate) {
      applyPartyDeckToggle(pendingPartyDeckDate);
    }
    setPartyDeckDisclaimerAccepted(true);
    setPendingPartyDeckDate(null);
    setShowPartyDeckDisclaimer(false);
  };

  const cancelPartyDeckDisclaimer = () => {
    setPendingPartyDeckDate(null);
    setShowPartyDeckDisclaimer(false);
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

  const formatFriendlyDateRange = (startIso: string, endIso: string) => {
    const [startYear, startMonth, startDay] = startIso.split("-").map(Number);
    const [endYear, endMonth, endDay] = endIso.split("-").map(Number);

    const startDate = new Date(startYear, startMonth - 1, startDay);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    const startMonthName = startDate.toLocaleString("en-US", { month: "long" });
    const endMonthName = endDate.toLocaleString("en-US", { month: "long" });

    const getOrdinal = (day: number) => {
      const j = day % 10;
      const k = day % 100;
      if (j === 1 && k !== 11) return `${day}st`;
      if (j === 2 && k !== 12) return `${day}nd`;
      if (j === 3 && k !== 13) return `${day}rd`;
      return `${day}th`;
    };

    if (startYear === endYear && startMonth === endMonth) {
      return `${startMonthName} ${getOrdinal(startDay)} – ${getOrdinal(
        endDay
      )}, ${startYear}`;
    }

    if (startYear === endYear) {
      return `${startMonthName} ${getOrdinal(
        startDay
      )} – ${endMonthName} ${getOrdinal(endDay)}, ${startYear}`;
    }

    return `${formatFriendlyDate(startIso)} – ${formatFriendlyDate(endIso)}`;
  };

  const sortIsoDates = (dates: string[]) =>
    [...dates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const getSelectedDatesSummary = (dates: string[]) => {
    const sorted = sortIsoDates(dates);

    if (sorted.length === 0) {
      return "Not selected";
    }

    if (sorted.length === 1) {
      return formatFriendlyDate(sorted[0]);
    }

    const allConsecutive = sorted.every((date, index) => {
      if (index === 0) return true;
      return isConsecutive(sorted[index - 1], date);
    });

    if (allConsecutive) {
      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      const [fYear, fMonth, fDay] = first.split("-").map(Number);
      const [lYear, lMonth, lDay] = last.split("-").map(Number);

      const firstDate = new Date(fYear, fMonth - 1, fDay);
      const lastDate = new Date(lYear, lMonth - 1, lDay);

      const firstMonth = firstDate.toLocaleString("en-US", { month: "long" });
      const lastMonth = lastDate.toLocaleString("en-US", { month: "long" });

      const getOrdinal = (day: number) => {
        const j = day % 10;
        const k = day % 100;
        if (j === 1 && k !== 11) return `${day}st`;
        if (j === 2 && k !== 12) return `${day}nd`;
        if (j === 3 && k !== 13) return `${day}rd`;
        return `${day}th`;
      };

      if (fYear === lYear && fMonth === lMonth) {
        return `${firstMonth} ${getOrdinal(fDay)} – ${getOrdinal(
          lDay
        )}, ${fYear}`;
      }

      if (fYear === lYear) {
        return `${firstMonth} ${getOrdinal(fDay)} – ${lastMonth} ${getOrdinal(
          lDay
        )}, ${fYear}`;
      }

      return `${formatFriendlyDate(first)} – ${formatFriendlyDate(last)}`;
    }

    return `${sorted.length} selected dates`;
  };

  const getSelectedDatesMeta = (dates: string[]) => {
    const sorted = sortIsoDates(dates);

    if (sorted.length <= 1) return "";

    const allConsecutive = sorted.every((date, index) => {
      if (index === 0) return true;
      return isConsecutive(sorted[index - 1], date);
    });

    if (allConsecutive) {
      return `${sorted.length} consecutive hunt day${
        sorted.length > 1 ? "s" : ""
      }`;
    }

    return "";
  };

  const isConsecutive = (d0: string, d1: string) => {
    const a = new Date(`${d0}T00:00:00`);
    const b = new Date(`${d1}T00:00:00`);
    return (b.getTime() - a.getTime()) / 86400000 === 1;
  };

  const inRange = (iso: string, startIso: string, endIso: string) => {
    const t = new Date(`${iso}T00:00:00`).getTime();
    const s = new Date(`${startIso}T00:00:00`).getTime();
    const e = new Date(`${endIso}T00:00:00`).getTime();
    return t >= s && t <= e;
  };

  const getPricingWindowForDate = (
    iso: string,
    cfg: SeasonConfig | null
  ): PricingWindow | null => {
    if (!cfg) return null;
    const windows = cfg.pricingWindows ?? [];
    return windows.find((w) => inRange(iso, w.start, w.end)) ?? null;
  };

  const samePricingWindow = (
    a: PricingWindow | null,
    b: PricingWindow | null
  ): boolean => {
    if (!a || !b) return false;
    return a.start === b.start && a.end === b.end && a.type === b.type;
  };

  const isDateInActiveSeason = (
    iso: string,
    cfg: SeasonConfig | null
  ): boolean => {
    if (!cfg?.seasonStart || !cfg?.seasonEnd) return false;
    return inRange(iso, cfg.seasonStart, cfg.seasonEnd);
  };

  const getInvalidSelectedDates = (): string[] => {
    return form.dates.filter((iso) => !isDateInActiveSeason(iso, seasonConfig));
  };

  const backTheBlueWindow = seasonConfig?.pricingWindows?.find(
    (w) => w.start === BACK_THE_BLUE_DATE && w.end === BACK_THE_BLUE_DATE
  );

  const backTheBlueSelected = form.dates.includes(BACK_THE_BLUE_DATE);

  useEffect(() => {
    if (!backTheBlueSelected) {
      setBackTheBlueAccepted(false);
    }
  }, [backTheBlueSelected]);

  const confirmBackTheBlueDisclaimer = () => {
    setBackTheBlueAccepted(true);
    setShowBackTheBlueDisclaimer(false);
  };

  const cancelBackTheBlueDisclaimer = () => {
    setShowBackTheBlueDisclaimer(false);
  };

  const handleNextStep = () => {
    commitHunters();

    if (step === 2) {
      if (form.dates.length === 0) {
        alert("Please select at least one date.");
        return;
      }

      const invalidDates = getInvalidSelectedDates();
      if (invalidDates.length > 0) {
        alert(
          `These selected dates are outside the active season: ${invalidDates.join(
            ", "
          )}`
        );
        return;
      }

      if (backTheBlueSelected && !backTheBlueAccepted) {
        setShowBackTheBlueDisclaimer(true);
        return;
      }
    }

    setStep((prev) => prev + 1);
  };
  const handlePrevStep = () => setStep((prev) => prev - 1);

  const calculateHuntSubtotal = (): number => {
    if (!seasonConfig) return 0;

    const validDates = sortIsoDates(
      form.dates.filter((iso) => isDateInActiveSeason(iso, seasonConfig))
    );

    const hunters = form.numberOfHunters || 1;
    let bookingTotal = 0;

    for (let i = 0; i < validDates.length; ) {
      const d0 = validDates[i];
      const d1 = validDates[i + 1];
      const d2 = validDates[i + 2];

      const w0 = getPricingWindowForDate(d0, seasonConfig);
      const w1 = d1 ? getPricingWindowForDate(d1, seasonConfig) : null;
      const w2 = d2 ? getPricingWindowForDate(d2, seasonConfig) : null;

      if (w0?.type === "package") {
        const canUseThreeDay =
          !!d0 &&
          !!d1 &&
          !!d2 &&
          !!w1 &&
          !!w2 &&
          samePricingWindow(w0, w1) &&
          samePricingWindow(w1, w2) &&
          isConsecutive(d0, d1) &&
          isConsecutive(d1, d2);

        if (canUseThreeDay) {
          bookingTotal += (w0.threeDayCombo ?? 450) * hunters;
          i += 3;
          continue;
        }

        const canUseTwoDay =
          !!d0 &&
          !!d1 &&
          !!w1 &&
          samePricingWindow(w0, w1) &&
          isConsecutive(d0, d1);

        if (canUseTwoDay) {
          bookingTotal += (w0.twoConsecutiveDays ?? 350) * hunters;
          i += 2;
          continue;
        }

        bookingTotal += (w0.singleDay ?? 200) * hunters;
        i += 1;
        continue;
      }

      if (w0?.type === "flat") {
        bookingTotal += (w0.rate ?? seasonConfig.weekdayRate ?? 150) * hunters;
        i += 1;
        continue;
      }

      bookingTotal += (seasonConfig.weekdayRate ?? 150) * hunters;
      i += 1;
    }

    return bookingTotal;
  };

  const calculateTotalPrice = (): number => {
    if (!seasonConfig) return 0;

    const huntSubtotal = calculateHuntSubtotal();
    const partyDeckCost =
      (seasonConfig.partyDeckRatePerDay ?? 500) * form.partyDeckDates.length;

    return huntSubtotal + partyDeckCost;
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
    const invalidDates = getInvalidSelectedDates();

    if (invalidDates.length > 0) {
      alert(
        `These selected dates are outside the active season: ${invalidDates.join(
          ", "
        )}`
      );
      return;
    }
    if (backTheBlueSelected && !backTheBlueAccepted) {
      setStep(2);
      setShowBackTheBlueDisclaimer(true);
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
      backTheBlueAccepted,
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

  return (
    <div className="max-w-2xl lg:w-[1000px] mx-auto mt-15 bg-white/95  p-8  shadow-2xl text-[var(--color-text)]">
      <h2 className="text-3xl font-gin mb-0 text-center text-[var(--color-footer)] bg-neutral-100 py-1">
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
            <div className="rounded-2xl border border-black/10 bg-white px-4 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:px-6 sm:py-6">
              <div className="mx-auto max-w-[520px] text-sm text-[var(--color-footer)] text-center">
                <DateSelector
                  onSelect={(dates) => setForm((prev) => ({ ...prev, dates }))}
                  seasonConfig={seasonConfig}
                  numberOfHunters={form.numberOfHunters}
                />
              </div>
            </div>

            {seasonConfig && (
              <p className="mt-3 text-center text-xs text-[var(--color-footer)]/80">
                Available booking dates are limited to{" "}
                <strong>
                  {formatFriendlyDateRange(
                    seasonConfig.seasonStart,
                    seasonConfig.seasonEnd
                  )}
                </strong>
                .
              </p>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-5">
              {/* Booking overview */}
              <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                    Booking Overview
                  </p>
                  <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                    Review your hunt details
                  </h3>
                </div>

                <div className="px-5 py-5 md:px-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                        Hunters
                      </p>
                      <p className="mt-2 text-2xl font-bold text-[var(--color-footer)]">
                        {form.numberOfHunters}
                      </p>
                    </div>

                    <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                        Selected Dates
                      </p>
                      <p className="mt-2 text-base font-semibold text-[var(--color-footer)]">
                        {getSelectedDatesSummary(form.dates)}
                      </p>
                      {getSelectedDatesMeta(form.dates) && (
                        <p className="mt-1 text-xs text-[var(--color-footer)]/65">
                          {getSelectedDatesMeta(form.dates)}
                        </p>
                      )}
                    </div>
                  </div>

                  {form.dates.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {sortIsoDates(form.dates).map((date) => (
                        <span
                          key={date}
                          className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-[var(--color-footer)] shadow-sm"
                        >
                          {formatFriendlyDate(date)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Back the Blue event card */}
              {backTheBlueSelected && (
                <section className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 shadow-[0_10px_30px_rgba(37,99,235,0.08)]">
                  <div className="border-b border-blue-200/70 bg-blue-100/50 px-5 py-4 md:px-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-900/60">
                      {backTheBlueWindow?.label || "Special Event"}
                    </p>
                    <h3 className="mt-1 text-lg font-acumin text-blue-950">
                      Back the Blue event booking selected
                    </h3>
                  </div>

                  <div className="px-5 py-5 md:px-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <img
                        src={backTheBlueFlyer}
                        alt="Back the Blue Dove Hunt flyer"
                        className="h-24 w-24 rounded-xl border border-blue-200/80 object-cover shadow-sm"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-7 text-blue-900">
                          {backTheBlueWindow?.disclaimerBody ||
                            "By selecting October 3rd, 2026, you confirm that all hunters on this booking qualify as first responders. Proof will be required at check-in. Anyone unable to provide proof will be turned away with no refund."}
                        </p>

                        <button
                          type="button"
                          onClick={() => setShowBackTheBlueDisclaimer(true)}
                          className="mt-4 inline-flex items-center rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-900 transition hover:bg-blue-100"
                        >
                          View event flyer
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Attendees */}
              <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                    Attendees
                  </p>
                  <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                    Enter full names for all attendees
                  </h3>
                </div>

                <div className="space-y-3 px-5 py-5 md:px-6">
                  {attendees.map((a, i) => (
                    <label key={i} className="block">
                      <span className="text-xs font-medium text-[var(--color-footer)]/75">
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
                        className="mt-1 w-full rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] placeholder:text-[var(--color-footer)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                      />
                    </label>
                  ))}

                  {!attendeeNamesComplete && (
                    <p className="pt-1 text-xs text-red-600">
                      Please provide a full name (first & last) for each
                      attendee.
                    </p>
                  )}
                </div>
              </section>

              {/* Party Deck */}
              {form.dates.length > 0 && (
                <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                  <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                          Add-On Option
                        </p>
                        <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                          Party Deck
                        </h3>
                        <p className="mt-1 text-sm text-[var(--color-footer)]/70">
                          Optional add-on at $500 per reserved day.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowPartyDeck(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-footer)] bg-[var(--color-footer)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-button-hover)]"
                        aria-label="Preview Party Deck details and photos"
                      >
                        Preview <MdOutlinePreview className="size-5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 px-5 py-5 md:px-6">
                    {form.dates.map((date) => {
                      const availabilityKnown = date in deckAvailability;
                      const isAvailable = deckAvailability[date] === true;
                      const checked = form.partyDeckDates.includes(date);

                      return (
                        <label
                          key={date}
                          className={`flex items-center justify-between gap-4 rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm ${
                            !availabilityKnown || !isAvailable
                              ? "opacity-70"
                              : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              disabled={!availabilityKnown || !isAvailable}
                              checked={checked}
                              onChange={() => togglePartyDeckDate(date)}
                              className="accent-[var(--color-accent-gold)]"
                            />

                            <span className="text-[var(--color-footer)]">
                              {formatFriendlyDate(date)}
                            </span>
                          </div>

                          <span className="text-xs font-medium text-[var(--color-footer)]/65">
                            {!availabilityKnown
                              ? "Checking..."
                              : !isAvailable
                              ? "Unavailable"
                              : "$500/day"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Summary */}
              {seasonConfig && (
                <section className="overflow-hidden rounded-2xl border border-[var(--color-accent-gold)]/30 bg-[var(--color-accent-gold)]/10 shadow-[0_12px_35px_rgba(0,0,0,0.06)]">
                  <div className="border-b border-[var(--color-footer)]/10 px-5 py-4 md:px-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/65">
                      Booking Summary
                    </p>
                    <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                      Final payment breakdown
                    </h3>
                  </div>

                  <div className="px-5 py-5 md:px-6">
                    <div className="space-y-3 text-sm text-[var(--color-footer)]">
                      <div className="flex items-center justify-between gap-4">
                        <span>Hunt subtotal</span>
                        <span className="font-semibold">
                          ${calculateHuntSubtotal()}
                        </span>
                      </div>

                      {form.partyDeckDates.length > 0 && (
                        <div className="flex items-start justify-between gap-4">
                          <span>
                            Party Deck
                            <span className="block text-xs text-[var(--color-footer)]/65">
                              {form.partyDeckDates.length} day
                              {form.partyDeckDates.length > 1 ? "s" : ""} × $
                              {seasonConfig.partyDeckRatePerDay}
                            </span>
                          </span>
                          <span className="font-semibold">
                            $
                            {seasonConfig.partyDeckRatePerDay *
                              form.partyDeckDates.length}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="my-5 h-px bg-[var(--color-footer)]/12" />

                    <div className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--color-accent-gold)]/20 px-4 py-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/65">
                          Total due today
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-footer)]/75">
                          Secure your booking at checkout
                        </p>
                      </div>

                      <span className="text-3xl font-bold text-[var(--color-footer)]">
                        ${calculateTotalPrice()}
                      </span>
                    </div>

                    <p className="mt-4 text-center text-xs italic text-[var(--color-footer)]/80">
                      Your hunt will be reserved after checkout is completed.
                    </p>
                  </div>
                </section>
              )}
            </div>
          </>
        )}

        <div className="pt-6">
          {step < 3 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {step > 1 ? (
                <button
                  onClick={handlePrevStep}
                  className="order-2 inline-flex items-center justify-center rounded-md border border-[var(--color-footer)]/15 bg-white px-6 py-3 text-sm font-semibold text-[var(--color-footer)] transition hover:bg-neutral-50 sm:order-1"
                >
                  ← Back
                </button>
              ) : (
                <div className="hidden sm:block" />
              )}

              <button
                onClick={handleNextStep}
                className={`inline-flex items-center justify-center rounded-md border px-6 py-3 text-sm font-semibold transition ${
                  step > 1
                    ? "order-1 sm:order-2 border-[var(--color-footer)] bg-[var(--color-footer)] text-white hover:bg-[var(--color-button-hover)]"
                    : "sm:col-start-2 border-[var(--color-footer)] bg-[var(--color-footer)] text-white hover:bg-[var(--color-button-hover)]"
                }`}
              >
                Continue →
              </button>
            </div>
          ) : (
            <div className="mt-2 grid w-full gap-3 sm:grid-cols-2">
              <button
                onClick={handlePrevStep}
                className="order-2 inline-flex items-center justify-center rounded-md border border-[var(--color-footer)]/15 bg-white px-6 py-3 text-sm font-semibold text-[var(--color-footer)] transition hover:bg-neutral-50 sm:order-1"
              >
                ← Back
              </button>

              <button
                onClick={handleSubmit}
                className="order-1 inline-flex items-center justify-center rounded-md border border-[var(--color-footer)] bg-[var(--color-footer)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-button-hover)] sm:order-2"
              >
                Checkout
              </button>
            </div>
          )}
        </div>
      </div>
      <AnimatePresence>
        {showPartyDeck && (
          <motion.div
            className="fixed  inset-0 z-[100] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPartyDeck(false)}
          >
            <div
              className="absolute  inset-0  flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                className="h-[80vh] mt-[58px] relative w-full overflow-y-auto bg-gradient-to-b from-[var(--color-background)]/60 to-[var(--color-footer)]  border border-white/10 shadow-2xl"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Header */}
                <div className="sticky top-0 z-[90] flex items-center justify-between px-4 md:px-6 py-3 bg-[var(--color-card)]/90 backdrop-blur border-b border-white/10">
                  <h3 className="text-white font-gin text-lg">Party Deck</h3>
                  <button
                    onClick={() => setShowPartyDeck(false)}
                    className="text-[var(--color-card)] font-bold bg-white  rounded-lg px-3 py-1 border border-white/10 "
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                {/* Body: reuse your existing component exactly as-is */}
                <div className="px-2 md:px-4 pb-4">
                  <PartyDeck />
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPartyDeckDisclaimer && (
          <motion.div
            className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelPartyDeckDisclaimer}
          >
            <div
              className="absolute inset-0 flex items-center justify-center px-4"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-6 shadow-2xl"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                    Party Deck Notice
                  </p>
                  <h3 className="mt-2 text-2xl font-acumin text-[var(--color-footer)]">
                    Party Deck access is reserved per hunt
                  </h3>
                </div>

                <p className="text-sm leading-7 text-[var(--color-footer)]/85">
                  If you leave after your hunt and want to return to the Party
                  Deck later that same day, you will need to book another hunt
                  for that return access.
                </p>

                <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                  <button
                    type="button"
                    onClick={cancelPartyDeckDisclaimer}
                    className="rounded-md border border-black/10 px-4 py-2 text-sm font-semibold text-[var(--color-footer)] hover:bg-neutral-100 transition"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={confirmPartyDeckDisclaimer}
                    className="rounded-md bg-[var(--color-footer)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-button-hover)] transition"
                  >
                    I understand
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBackTheBlueDisclaimer && (
          <motion.div
            className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm p-3 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelBackTheBlueDisclaimer}
          >
            <div
              className="absolute inset-0 flex items-start sm:items-center justify-center px-3 sm:px-4 pt-[84px] pb-3 sm:py-4"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                className="relative my-3 flex w-full max-w-4xl flex-col overflow-hidden border border-white/10 bg-white shadow-2xl max-sm:max-h-[calc(100dvh-96px)] sm:max-h-[92vh]"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="grid h-full min-h-0 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="bg-neutral-100 p-3 sm:p-4 lg:p-0">
                      {/* Mobile / tablet preview */}
                      <div className="lg:hidden">
                        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
                          <img
                            src={backTheBlueFlyer}
                            alt="Back the Blue Dove Hunt flyer"
                            className="w-full h-auto max-h-[34vh] object-contain bg-white sm:max-h-[42vh]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowBackTheBlueFlyerViewer(true)}
                          className="mt-3 w-full rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[var(--color-footer)] hover:bg-neutral-100 transition"
                        >
                          View full flyer
                        </button>
                      </div>

                      {/* Desktop image panel */}
                      <div className="hidden lg:block h-full">
                        <img
                          src={backTheBlueFlyer}
                          alt="Back the Blue Dove Hunt flyer"
                          className="w-full h-full object-cover max-h-[92vh]"
                        />
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col max-lg:min-h-0">
                      <div className="min-h-0 flex-1 px-5 pt-5 pb-24 sm:px-6 sm:pt-6 sm:pb-5 md:px-8 md:pb-6 lg:pb-6">
                        <div className="mb-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                            {backTheBlueWindow?.label || "Special Event Notice"}
                          </p>

                          <h3 className="mt-2 text-xl sm:text-2xl md:text-3xl font-acumin text-[var(--color-footer)] leading-tight">
                            {backTheBlueWindow?.disclaimerTitle ||
                              "First responder confirmation required"}
                          </h3>

                          <p className="mt-3 text-sm leading-6 sm:leading-7 text-[var(--color-footer)]/85">
                            {backTheBlueWindow?.disclaimerBody ||
                              "By selecting October 3rd, 2026, you confirm that all hunters on this booking qualify as first responders. Proof will be required at check-in. Anyone unable to provide proof will be turned away with no refund."}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
                          <div className="mt-3 space-y-3 text-sm text-[var(--color-footer)]">
                            <div className="flex items-start justify-between gap-4 border-b border-black/5 pb-3">
                              <span className="text-[var(--color-footer)]/70">
                                Date
                              </span>
                              <span className="font-semibold text-right">
                                October 3rd, 2026
                              </span>
                            </div>

                            <div className="flex items-start justify-between gap-4 border-b border-black/5 pb-3">
                              <span className="text-[var(--color-footer)]/70">
                                Location
                              </span>
                              <span className="font-semibold text-right">
                                Brownsville, Texas
                              </span>
                            </div>

                            <div className="flex items-start justify-between gap-4">
                              <span className="text-[var(--color-footer)]/70">
                                Pricing
                              </span>
                              <span className="font-semibold text-right">
                                $50 per gun
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="mt-5 text-xs leading-6 text-[var(--color-footer)]/65">
                          You should only continue if your booking qualifies for
                          this event. Proof will be required at check-in.
                        </p>
                      </div>

                      <div className="shrink-0 border-t border-black/10 bg-white/95 px-5 py-4 backdrop-blur shadow-[0_-10px_30px_rgba(0,0,0,0.08)] max-lg:sticky max-lg:bottom-0 max-lg:z-10 sm:px-6 md:px-8">
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                          <button
                            type="button"
                            onClick={cancelBackTheBlueDisclaimer}
                            className="rounded-md border border-black/10 px-4 py-2 text-sm font-semibold text-[var(--color-footer)] hover:bg-neutral-100 transition"
                          >
                            Cancel
                          </button>

                          <button
                            type="button"
                            onClick={confirmBackTheBlueDisclaimer}
                            className="rounded-md bg-[var(--color-footer)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-button-hover)] transition"
                          >
                            I agree
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBackTheBlueFlyerViewer && (
          <motion.div
            className="fixed inset-0 z-[140] bg-black/85 backdrop-blur-sm p-3 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowBackTheBlueFlyerViewer(false)}
          >
            <div
              className="absolute inset-0 overflow-y-auto px-3 pt-[84px] pb-3 sm:flex sm:items-center sm:justify-center sm:px-4 sm:py-4"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                className="relative w-full max-w-3xl max-h-[calc(100vh-96px)] sm:max-h-[94vh] overflow-hidden rounded-[24px] border border-white/10 bg-white shadow-2xl"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-white/95 px-4 py-3 backdrop-blur">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-footer)]/55">
                      Event Flyer
                    </p>
                    <p className="text-sm font-semibold text-[var(--color-footer)]">
                      Back the Blue Dove Hunt
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowBackTheBlueFlyerViewer(false)}
                    className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-semibold text-[var(--color-footer)] hover:bg-neutral-100 transition"
                  >
                    Close
                  </button>
                </div>

                <div className="max-h-[calc(94vh-68px)] overflow-y-auto bg-neutral-100 p-3 sm:p-4">
                  <img
                    src={backTheBlueFlyer}
                    alt="Back the Blue Dove Hunt flyer"
                    className="mx-auto w-full h-auto object-contain rounded-xl border border-black/10 bg-white"
                  />
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BookingForm;
