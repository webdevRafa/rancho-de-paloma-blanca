import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import type { NewBooking, SeasonConfig } from "../types/Types";
import gsignup from "../assets/google-signup.png";
import { useNavigate } from "react-router-dom";
import DateSelector from "./DateSelector";
import { getSeasonConfig } from "../utils/getSeasonConfig";

const BookingForm = () => {
  const { user, login } = useAuth();
  const [step, setStep] = useState(1);
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);
  const calculateTotalPrice = (): number => {
    if (!seasonConfig) return 0;

    const partyDeckCost = form.includesPartyDeck
      ? seasonConfig.partyDeckRatePerDay * form.dates.length
      : 0;

    return form.numberOfHunters * baseRate() + partyDeckCost;
  };

  const navigate = useNavigate();
  const [form, setForm] = useState({
    numberOfHunters: 1,
    includesPartyDeck: false,
    selectedPackage: "1-day" as "1-day" | "2-day" | "3-day",
    dates: [] as string[],
  });
  useEffect(() => {
    const fetchConfig = async () => {
      const config = await getSeasonConfig();
      setSeasonConfig(config);
    };
    fetchConfig();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.checked }));
  };

  const handleNextStep = () => setStep((prev) => prev + 1);
  const handlePrevStep = () => setStep((prev) => prev - 1);

  const handleSubmit = async () => {
    if (!user) return alert("Please sign in with Google first.");

    const price =
      form.numberOfHunters *
      (form.selectedPackage === "1-day"
        ? 200
        : form.selectedPackage === "2-day"
        ? 350
        : 450);

    const booking: NewBooking = {
      userId: user.uid,
      name: user.displayName || "Unknown",
      email: user.email || "No email",
      phone: "",
      dates: form.dates,
      numberOfHunters: form.numberOfHunters,
      includesPartyDeck: form.includesPartyDeck,
      selectedPackage: form.selectedPackage,
      price,
      status: "pending",
      createdAt: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(collection(db, "bookings"), booking);
      navigate(`/booking-confirmed?bookingId=${docRef.id}`);
      alert("Booking submitted!");
      // redirect to payment page or confirmation
    } catch (err) {
      console.error("Error booking:", err);
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
  const baseRate = (): number => {
    if (!seasonConfig) return 0;

    const isInSeason = form.dates.every(
      (date) =>
        date >= seasonConfig.seasonStart && date <= seasonConfig.seasonEnd
    );

    return isInSeason
      ? seasonConfig.seasonRates[
          form.selectedPackage === "1-day"
            ? "singleDay"
            : form.selectedPackage === "2-day"
            ? "twoConsecutiveDays"
            : "threeDayCombo"
        ]
      : seasonConfig.offSeasonRate;
  };

  return (
    <div className="max-w-2xl mx-auto mt-20 bg-gradient-to-r from-[var(--color-dark)] via-[var(--color-footer)] to-[var(--color-dark)] p-8 rounded-xl shadow-2xl text-[var(--color-text)]">
      <h2 className="text-3xl font-broadsheet mb-1 text-center text-[var(--color-accent-gold)]">
        {step === 1 && "Choose a Package & Party Size"}
        {step === 2 && "Choose Your Dates & Extras"}
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
                Select Package
              </span>
              <select
                name="selectedPackage"
                value={form.selectedPackage}
                onChange={handleChange}
                className="bg-[var(--color-card)] border border-[var(--color-accent-sage)] px-4 py-3 rounded-md text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
              >
                <option value="1-day">1-Day Hunt ($200)</option>
                <option value="2-day">2-Day Combo ($350)</option>
                <option value="3-day">3-Day Weekend Combo ($450)</option>
              </select>
            </label>

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
            {/* Simulated date picker + party deck checkbox */}
            <div className="text-sm text-[var(--color-accent-sage)] text-center">
              <DateSelector
                selectedPackage={form.selectedPackage}
                onSelect={(dates) => setForm((prev) => ({ ...prev, dates }))}
                key={form.selectedPackage}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                name="includesPartyDeck"
                type="checkbox"
                checked={form.includesPartyDeck}
                onChange={handleCheckbox}
                className="accent-[var(--color-accent-gold)]"
              />
              <span className="text-[var(--color-accent-sage)] text-sm">
                Book Party Deck
              </span>
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <div className="text-sm text-[var(--color-accent-sage)]">
              <p>
                Package: <strong>{form.selectedPackage}</strong>
              </p>
              <p>
                Hunters: <strong>{form.numberOfHunters}</strong>
              </p>
              <p>
                Party Deck:{" "}
                <strong>{form.includesPartyDeck ? "Yes" : "No"}</strong>
              </p>
              <p>
                Dates:{" "}
                <strong>{form.dates.join(", ") || "Not selected"}</strong>
              </p>
            </div>
            {seasonConfig && (
              <div className="text-center text-[var(--color-text)] space-y-1 text-sm mt-4">
                <p className="text-lg font-semibold text-[var(--color-text)]">
                  Total Price: ${calculateTotalPrice()}
                </p>

                <p>
                  Base Rate: ${baseRate()} × {form.numberOfHunters}{" "}
                  {form.numberOfHunters > 1 ? "hunters" : "hunter"}
                </p>

                {form.includesPartyDeck && (
                  <p>
                    Party Deck: ${seasonConfig.partyDeckRatePerDay} ×{" "}
                    {form.dates.length} {form.dates.length > 1 ? "days" : "day"}{" "}
                    = ${seasonConfig.partyDeckRatePerDay * form.dates.length}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Navigation Buttons */}
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
