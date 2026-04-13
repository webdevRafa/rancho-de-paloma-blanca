import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import {
  collection,
  getDocs,
  query,
  where,
  documentId,
} from "firebase/firestore";
import type { Availability, SeasonConfig } from "../types/Types";
import { DayPicker, useDayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { toLocalDateString } from "../utils/formatDate";

interface DateSelectorProps {
  onSelect: (dates: string[]) => void;
  seasonConfig: SeasonConfig | null;
  numberOfHunters: number;
  selectedDates?: string[];
}

type AvailabilityDoc = Availability & { id: string };

const DateSelector = ({
  onSelect,
  seasonConfig,
  numberOfHunters,
  selectedDates = [],
}: DateSelectorProps) => {
  const [availableDates, setAvailableDates] = useState<AvailabilityDoc[]>([]);
  const [selected, setSelected] = useState<Date[]>([]);
  const [month, setMonth] = useState<Date | undefined>(undefined);

  // Compute active season boundaries
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toLocalDateString(today);

  const rawStart = seasonConfig?.seasonStart?.replace(/"/g, "") ?? "";
  const rawEnd = seasonConfig?.seasonEnd?.replace(/"/g, "") ?? "";

  // Do not allow selection before the later of today or season start
  const minSelectable = rawStart
    ? todayStr >= rawStart
      ? todayStr
      : rawStart
    : todayStr;

  // Hard stop at the configured season end
  const maxSelectable = rawEnd || minSelectable;
  const isoToLocalDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  useEffect(() => {
    const nextSelected = selectedDates.map(isoToLocalDate);
    setSelected(nextSelected);

    if (selectedDates.length > 0) {
      const sorted = [...selectedDates].sort();
      setMonth(isoToLocalDate(sorted[0]));
      return;
    }

    if (rawStart) {
      setMonth(new Date(`${rawStart}T00:00:00`));
    }
  }, [selectedDates, rawStart]);

  useEffect(() => {
    const fetchAvailability = async () => {
      if (!seasonConfig?.seasonStart || !seasonConfig?.seasonEnd) {
        setAvailableDates([]);
        return;
      }

      const startKey = minSelectable;
      const endKey = maxSelectable;

      // If today is already after the season end, show nothing
      if (startKey > endKey) {
        setAvailableDates([]);
        return;
      }

      const ref = collection(db, "availability");
      const q = query(
        ref,
        where(documentId(), ">=", startKey),
        where(documentId(), "<=", endKey)
      );

      const snap = await getDocs(q);
      const data: AvailabilityDoc[] = snap.docs.map((d) => ({
        ...(d.data() as Availability),
        id: d.id,
      }));

      setAvailableDates(data);
    };

    if (seasonConfig) fetchAvailability();
  }, [seasonConfig, minSelectable, maxSelectable]);

  // Quick lookup for capacity
  const availableMap = new Map(availableDates.map((d) => [d.id, d]));

  // Default to 100 if the config is missing this (your spec says 100/day).
  const maxCapacity = seasonConfig?.maxHuntersPerDay ?? 100;

  // Disable rule for DayPicker
  const isDateBlocked = (day: Date) => {
    const dateStr = toLocalDateString(day);

    // Before active season window
    if (dateStr < minSelectable) return true;

    // After active season window
    if (rawEnd && dateStr > rawEnd) return true;

    // Capacity check (treat missing doc as unavailable if it is inside season but not seeded)
    const avail = availableMap.get(dateStr);
    if (!avail) return true;

    const booked = avail.huntersBooked ?? 0;
    return booked + numberOfHunters > maxCapacity;
  };

  // Keep selected dates valid if party size/capacity changes
  useEffect(() => {
    setSelected((prev) => {
      const next = prev.filter((d) => !isDateBlocked(d));
      if (next.length !== prev.length) {
        onSelect(next.map((d) => toLocalDateString(d)));
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDates, numberOfHunters, minSelectable, maxCapacity]);

  const handleDayClick = (day: Date | undefined) => {
    if (!day) return;
    if (isDateBlocked(day)) return;

    const clickedISO = toLocalDateString(day);
    const exists = selected.find((d) => toLocalDateString(d) === clickedISO);

    let next: Date[];
    if (exists) {
      next = selected.filter((d) => toLocalDateString(d) !== clickedISO);
    } else {
      next = [...selected, new Date(day)];
    }
    setSelected(next);
    onSelect(next.map((d) => toLocalDateString(d)));
  };

  return (
    <div className="flex justify-center">
      <div className="date-selector">
        <DayPicker
          mode="multiple"
          month={month}
          onMonthChange={setMonth}
          startMonth={rawStart ? new Date(`${rawStart}T00:00:00`) : undefined}
          endMonth={rawEnd ? new Date(`${rawEnd}T00:00:00`) : undefined}
          defaultMonth={rawStart ? new Date(`${rawStart}T00:00:00`) : undefined}
          selected={selected}
          onDayClick={handleDayClick}
          disabled={isDateBlocked}
          modifiers={{ selected }}
          modifiersClassNames={{
            selected: "bg-[var(--color-accent-gold)] text-black",
            disabled: "opacity-40 cursor-not-allowed",
            today: "text-[var(--color-accent-gold)]",
          }}
          className="p-4 rounded"
          navLayout="after"
          components={{
            Nav: () => {
              const { previousMonth, nextMonth, goToMonth } = useDayPicker();
              return (
                <div className="flex justify-end items-center gap-2 mt-[-35px] mb-4">
                  <button
                    type="button"
                    disabled={!previousMonth}
                    onClick={() => previousMonth && goToMonth(previousMonth)}
                    className="p-1  text-[var(--color-footer)] hover:text-[var(--color-accent-gold)] disabled:opacity-40"
                    aria-label="Previous month"
                  >
                    <svg
                      width="25"
                      height="25"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={!nextMonth}
                    onClick={() => nextMonth && goToMonth(nextMonth)}
                    className="p-1 text-[var(--color-footer)] hover:text-[var(--color-accent-gold)] disabled:opacity-40"
                    aria-label="Next month"
                  >
                    <svg
                      width="25"
                      height="25"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
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
    </div>
  );
};

export default DateSelector;
