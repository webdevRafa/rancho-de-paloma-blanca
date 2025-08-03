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
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { toLocalDateString } from "../utils/formatDate";

interface DateSelectorProps {
  selectedPackage: "1-day" | "2-day" | "3-day";
  onSelect: (dates: string[]) => void;
}

const DateSelector = ({ selectedPackage, onSelect }: DateSelectorProps) => {
  const [availableDates, setAvailableDates] = useState<Availability[]>([]);
  const [selected, setSelected] = useState<Date[]>([]);

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

  const availableMap = new Map(availableDates.map((d) => [d.id, d]));
  const bookedOut = new Set(
    availableDates.filter((d) => d.huntersBooked >= 75).map((d) => d.id)
  );

  const isDateBlocked = (day: Date) => {
    const dateStr = toLocalDateString(day);
    return !availableMap.has(dateStr) || bookedOut.has(dateStr);
  };

  const handleSelect = (day: Date | undefined) => {
    if (!day) return;

    const clicked = new Date(day);
    const dateStr = toLocalDateString(clicked);
    let selectedDates: string[] = [];

    if (selectedPackage === "1-day") {
      selectedDates = [dateStr];
    } else if (selectedPackage === "2-day") {
      const next = new Date(clicked);
      next.setDate(clicked.getDate() + 1);
      const nextStr = toLocalDateString(next);

      if (!availableMap.has(nextStr) || bookedOut.has(nextStr)) {
        alert("Next day not available.");
        return;
      }

      selectedDates = [dateStr, nextStr];
    } else if (selectedPackage === "3-day") {
      if (clicked.getDay() !== 5) {
        alert("3-day package must start on a Friday.");
        return;
      }

      const sat = new Date(clicked);
      const sun = new Date(clicked);
      sat.setDate(clicked.getDate() + 1);
      sun.setDate(clicked.getDate() + 2);

      const satStr = toLocalDateString(sat);
      const sunStr = toLocalDateString(sun);

      if (!availableMap.has(satStr) || !availableMap.has(sunStr)) {
        alert("Saturday or Sunday not available.");
        return;
      }

      if (bookedOut.has(satStr) || bookedOut.has(sunStr)) {
        alert("One of the weekend days is booked.");
        return;
      }

      selectedDates = [dateStr, satStr, sunStr];
    }

    const dateObjects = selectedDates.map((d) => {
      const [y, m, d2] = d.split("-").map(Number);
      return new Date(y, m - 1, d2); // Local-safe
    });

    setSelected(dateObjects);
    onSelect(selectedDates);
  };

  return (
    <div className="flex justify-center">
      <DayPicker
        mode="single"
        selected={selected[0]}
        onSelect={handleSelect}
        disabled={isDateBlocked}
        modifiers={{ selected }}
        modifiersClassNames={{
          selected: "bg-[var(--color-accent-gold)] text-black",
          disabled: "opacity-40 cursor-not-allowed",
        }}
        className="p-4 rounded shadow-lg"
      />
    </div>
  );
};

export default DateSelector;
