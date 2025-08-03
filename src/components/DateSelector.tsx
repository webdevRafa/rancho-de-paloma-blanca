import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import type { Availability, SeasonConfig } from "../types/Types";
import { DayPicker, useDayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { toLocalDateString } from "../utils/formatDate";

/**
 * Props for the DateSelector component. The component allows users to
 * freely select any combination of future dates, subject to capacity
 * restrictions. It is aware of the season configuration to
 * determine the earliest selectable day and the daily capacity.
 */
interface DateSelectorProps {
  /**
   * Callback invoked whenever the selected dates change. The callback
   * receives an array of ISO date strings (YYYY-MM-DD) representing
   * the chosen days.
   */
  onSelect: (dates: string[]) => void;
  /**
   * Active season configuration pulled from Firestore. Used to look
   * up the maximum capacity per day and to compute the first date
   * hunters are allowed to book (i.e. seasonStart or today, whichever
   * is later).
   */
  seasonConfig: SeasonConfig | null;
  /**
   * Number of hunters in the current booking. Used to evaluate
   * whether a day has enough capacity remaining for the entire party.
   */
  numberOfHunters: number;
}

const DateSelector = ({
  onSelect,
  seasonConfig,
  numberOfHunters,
}: DateSelectorProps) => {
  const [availableDates, setAvailableDates] = useState<Availability[]>([]);
  const [selected, setSelected] = useState<Date[]>([]);

  // Fetch availability documents for all future dates. We query for
  // timestamps >= today. Each document stores the number of hunters
  // already booked for that day and whether the party deck is booked.
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

  // Map for quick lookup of availability by date string
  const availableMap = new Map(availableDates.map((d) => [d.id, d]));
  // Determine per-day capacity. Default to 75 if the season config has not
  // loaded yet, to avoid blocking selection prematurely.
  const maxCapacity = seasonConfig?.maxHuntersPerDay ?? 75;

  // Compute the earliest selectable date. Hunters cannot book days in the
  // past, and the season does not open until seasonStart. The first
  // selectable date should therefore be today if today is on or after
  // the season start; otherwise it should be the season start date.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toLocalDateString(today);
  // Remove any extraneous quotes from the seasonStart string
  const rawStart = seasonConfig?.seasonStart?.replace(/"/g, "") ?? "";
  let minSelectableDate = todayStr;
  if (rawStart) {
    minSelectableDate = todayStr >= rawStart ? todayStr : rawStart;
  }

  /**
   * Determine if a day should be disabled. A day is disabled if it
   * occurs before the minimum selectable date (either in the past or
   * before the season starts) or if the remaining capacity cannot
   * accommodate the current party size. A missing availability record
   * implies zero hunters booked and thus availability.
   */
  const isDateBlocked = (day: Date) => {
    const dateStr = toLocalDateString(day);
    // Block dates earlier than the minimum selectable date
    if (dateStr < minSelectableDate) {
      return true;
    }
    const avail = availableMap.get(dateStr);
    if (!avail) return false;
    return avail.huntersBooked + numberOfHunters > maxCapacity;
  };

  /**
   * Toggle the clicked date in the selection. If the day is already
   * selected, it will be removed. Otherwise, it will be added to the
   * selection provided there is enough capacity.
   */
  const handleDayClick = (day: Date | undefined) => {
    if (!day) return;
    const clicked = new Date(day);
    const dateStr = toLocalDateString(clicked);
    // Ignore clicks on blocked days
    if (isDateBlocked(clicked)) return;
    // Check if the day is already selected
    const existingIndex = selected.findIndex(
      (d) => toLocalDateString(d) === dateStr
    );
    let newSelected: Date[] = [];
    if (existingIndex >= 0) {
      // Remove the existing selection
      newSelected = [...selected];
      newSelected.splice(existingIndex, 1);
    } else {
      // Add the new date
      newSelected = [...selected, clicked];
    }
    setSelected(newSelected);
    onSelect(newSelected.map((d) => toLocalDateString(d)));
  };

  return (
    <div className="flex justify-center">
      <DayPicker
        mode="multiple"
        selected={selected}
        onDayClick={handleDayClick}
        disabled={isDateBlocked}
        modifiers={{ selected }}
        modifiersClassNames={{
          selected: "bg-[var(--color-accent-gold)] text-black",
          disabled: "opacity-40 cursor-not-allowed",
          today: "text-[var(--color-accent-gold)]",
        }}
        className="p-4 rounded shadow-lg"
        navLayout="after"
        components={{
          Nav: () => {
            const { previousMonth, nextMonth, goToMonth } = useDayPicker();
            return (
              <div className="flex justify-end items-center gap-2 mt-[-35px] mb-4">
                <button
                  type="button"
                  disabled={!previousMonth}
                  onClick={() => previousMonth && goToMonth(previousMonth!)}
                  className="p-1 text-white disabled:opacity-40"
                  aria-label="Previous month"
                >
                  {/* Left arrow */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={!nextMonth}
                  onClick={() => nextMonth && goToMonth(nextMonth!)}
                  className="p-1 text-white disabled:opacity-40"
                  aria-label="Next month"
                >
                  {/* Right arrow */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            );
          },
        }}
      />
    </div>
  );
};

export default DateSelector;
