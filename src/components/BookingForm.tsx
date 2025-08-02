import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import type { NewBooking } from "../types/Types";
import gsignup from "../assets/google-signup.png";

const BookingForm = () => {
  const { user, login } = useAuth();

  const [form, setForm] = useState({
    numberOfHunters: 1,
    includesPartyDeck: false,
    selectedPackage: "1-day" as "1-day" | "2-day" | "3-day",
    dates: [] as string[],
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.checked }));
  };

  const handleSubmit = async () => {
    if (!user) return alert("Please sign in with Google first.");

    const booking: NewBooking = {
      userId: user.uid,
      name: user.displayName || "Unknown",
      email: user.email || "No email",
      phone: "", // optional
      dates: form.dates,
      numberOfHunters: form.numberOfHunters,
      includesPartyDeck: form.includesPartyDeck,
      selectedPackage: form.selectedPackage,
      price: 0,
      status: "pending",
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "bookings"), booking);
      alert("Booking submitted!");
    } catch (err) {
      console.error("Error booking:", err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-20 bg-gradient-to-r from-[var(--color-dark)] via-[var(--color-footer)] to-[var(--color-dark)] p-8 rounded-xl shadow-2xl text-[var(--color-text)]">
      {!user ? (
        <img
          className="cursor-pointer hover:scale-105 transition-transform duration-300 mx-auto"
          onClick={login}
          src={gsignup}
          alt="Sign in with Google"
        />
      ) : (
        <>
          <h2 className="text-3xl font-broadsheet mb-6 text-center text-[var(--color-accent-gold)]">
            Book Your Hunt
          </h2>

          <p className="mb-8 text-sm text-[var(--color-accent-sage)] text-center">
            Welcome, {user.displayName} ({user.email})
          </p>

          <div className="flex flex-col space-y-5">
            {/* Package Selector */}
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

            {/* Number of Hunters */}
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

            {/* Party Deck */}
            <label className="flex items-center gap-3">
              <input
                name="includesPartyDeck"
                type="checkbox"
                checked={form.includesPartyDeck}
                onChange={handleCheckbox}
                className="w-5 h-5 accent-[var(--color-accent-gold)]"
              />
              <span className="text-[var(--color-accent-sage)] text-sm">
                Book Party Deck
              </span>
            </label>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              className="w-full mt-4 bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white px-6 py-3 rounded-md text-sm  tracking-wide transition-all max-w-[180px]"
            >
              Submit Booking
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default BookingForm;
