import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import type { Availability } from "../types/Types";

interface DateSelectorProps {
  selectedPackage: "1-day" | "2-day" | "3-day";
  onSelect: (dates: string[]) => void;
}

const DateSelector = ({ selectedPackage, onSelect }: DateSelectorProps) => {
  const [availableDates, setAvailableDates] = useState<Availability[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  useEffect(() => {
    const fetchAvailability = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = Timestamp.fromDate(today);

      const ref = collection(db, "availability");
      const q = query(ref, where("timestamp", ">=", todayTimestamp));
      const snapshot = await getDocs(q);

      const data = snapshot.docs.map((doc) => doc.data() as Availability);
      setAvailableDates(data);
    };
    fetchAvailability();
  }, []);

  const handleDateClick = (dateId: string) => {
    let updated: string[] = [];

    if (selectedPackage === "1-day") {
      updated = [dateId];
    } else if (selectedPackage === "2-day") {
      const clickedDate = new Date(dateId);
      const nextDay = new Date(clickedDate);
      nextDay.setDate(clickedDate.getDate() + 1);
      const nextDateStr = nextDay.toISOString().split("T")[0];

      const isNextAvailable = availableDates.find((d) => d.id === nextDateStr);
      if (isNextAvailable) {
        updated = [dateId, nextDateStr];
      } else {
        alert("Please choose a date with a consecutive available next day.");
        return;
      }
    } else if (selectedPackage === "3-day") {
      const clicked = new Date(dateId);
      const day = clicked.getDay(); // 5 = Fri
      if (day !== 5) {
        alert("3-day package must start on a Friday.");
        return;
      }
      const sat = new Date(clicked);
      const sun = new Date(clicked);
      sat.setDate(clicked.getDate() + 1);
      sun.setDate(clicked.getDate() + 2);

      const satStr = sat.toISOString().split("T")[0];
      const sunStr = sun.toISOString().split("T")[0];

      const satOk = availableDates.find((d) => d.id === satStr);
      const sunOk = availableDates.find((d) => d.id === sunStr);

      if (satOk && sunOk) {
        updated = [dateId, satStr, sunStr];
      } else {
        alert("Saturday or Sunday is not available after this Friday.");
        return;
      }
    }

    setSelectedDates(updated);
    onSelect(updated);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {availableDates.map((date) => {
        const isSelected = selectedDates.includes(date.id);
        const isFull = date.huntersBooked >= 75;

        return (
          <button
            key={date.id}
            disabled={isFull}
            onClick={() => handleDateClick(date.id)}
            className={`px-4 py-2 rounded border text-sm transition-all
              ${
                isSelected
                  ? "bg-[var(--color-accent-gold)] text-black"
                  : "bg-[var(--color-card)] text-[var(--color-text)]"
              }
              ${
                isFull
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:ring-2 ring-[var(--color-accent-gold)]"
              }`}
          >
            {date.id}
          </button>
        );
      })}
    </div>
  );
};

export default DateSelector;
