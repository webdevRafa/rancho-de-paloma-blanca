import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import {
  collection,
  getDocs,
  query,
  where,
  documentId,
} from "firebase/firestore";
import type { Availability, SeasonConfig } from "../types/Types";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
// react-day-picker dates can behave like UTC calendar dates,
// so use UTC getters here to avoid the one-day-back bug.
const dayPickerDateToIso = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface DateSelectorProps {
  onSelect: (dates: string[]) => void;
  seasonConfig: SeasonConfig | null;
  numberOfHunters: number;
  selectedDates?: string[];
}

type AvailabilityDoc = Availability & { id: string };

const BACK_THE_BLUE_DATE = "2026-10-03";

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
  const todayStr = [
    today.getFullYear(),
    `${today.getMonth() + 1}`.padStart(2, "0"),
    `${today.getDate()}`.padStart(2, "0"),
  ].join("-");

  const rawStart = seasonConfig?.seasonStart?.replace(/"/g, "") ?? "";
  const rawEnd = seasonConfig?.seasonEnd?.replace(/"/g, "") ?? "";
  const selectedDatesKey = useMemo(
    () => [...selectedDates].sort().join("|"),
    [selectedDates]
  );
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
  const isBackTheBlueDate = (day: Date) =>
    dayPickerDateToIso(day) === BACK_THE_BLUE_DATE;

  useEffect(() => {
    const sortedSelected = selectedDatesKey ? selectedDatesKey.split("|") : [];

    const nextSelected = sortedSelected.map(isoToLocalDate);
    setSelected(nextSelected);

    if (sortedSelected.length > 0) {
      setMonth(isoToLocalDate(sortedSelected[0]));
      return;
    }

    if (rawStart) {
      setMonth(isoToLocalDate(rawStart));
    } else {
      setMonth(undefined);
    }
  }, [selectedDatesKey, rawStart]);

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
    const dateStr = dayPickerDateToIso(day);

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
        onSelect(next.map((d) => dayPickerDateToIso(d)));
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDates, numberOfHunters, minSelectable, maxCapacity]);

  const handleSelect = (nextSelected: Date[] | undefined) => {
    const safeNext = (nextSelected ?? []).filter((day) => !isDateBlocked(day));

    setSelected(safeNext);
    onSelect(safeNext.map((d) => dayPickerDateToIso(d)));
  };

  return (
    <div className="flex justify-center">
      <div className="date-selector touch-manipulation w-full max-w-[500px] px-1 sm:px-3">
        <DayPicker
          mode="multiple"
          month={month}
          onMonthChange={setMonth}
          startMonth={rawStart ? new Date(`${rawStart}T00:00:00`) : undefined}
          endMonth={rawEnd ? new Date(`${rawEnd}T00:00:00`) : undefined}
          defaultMonth={rawStart ? new Date(`${rawStart}T00:00:00`) : undefined}
          selected={selected}
          onSelect={handleSelect}
          disabled={isDateBlocked}
          modifiers={{
            backTheBlue: isBackTheBlueDate,
          }}
          modifiersClassNames={{
            selected: "text-black",
            disabled: "opacity-35 cursor-not-allowed",
            today: "text-[var(--color-accent-gold)]",
          }}
          className="w-full rounded-[28px] bg-white px-2 py-4 sm:px-4 sm:py-5"
          classNames={{
            months: "w-full",
            month: "w-full",
            month_caption:
              "mb-4 flex items-center justify-between gap-3 px-0.5 sm:px-1 text-[var(--color-footer)]",
            caption_label:
              "text-[22px] leading-none sm:text-[32px] font-acumin font-semibold",
            nav: "flex items-center gap-2 shrink-0",
            button_previous:
              "inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border border-black/10 bg-white text-[var(--color-footer)] transition hover:border-black/20 hover:bg-neutral-100 disabled:opacity-40",
            button_next:
              "inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border border-black/10 bg-white text-[var(--color-footer)] transition hover:border-black/20 hover:bg-neutral-100 disabled:opacity-40",
            month_grid:
              "w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-2 sm:border-spacing-x-2 sm:border-spacing-y-2.5",
            weekdays: "mb-1 sm:mb-2",
            weekday:
              "text-[10px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-footer)]/55",
            week: "",
            day: "p-0.5 text-center align-middle",
            day_button:
              "mx-auto h-9 w-9 sm:h-11 sm:w-11 rounded-lg border border-transparent text-sm font-semibold text-[var(--color-footer)] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]/50",
            outside: "text-[var(--color-footer)]/25",
            hidden: "invisible",
          }}
          navLayout="after"
          components={{
            Chevron: ({ orientation, ...props }) => (
              <svg
                {...props}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {orientation === "left" ? (
                  <polyline points="15 18 9 12 15 6" />
                ) : (
                  <polyline points="9 18 15 12 9 6" />
                )}
              </svg>
            ),
            DayButton: (props) => {
              const iso = dayPickerDateToIso(props.day.date);
              const isBlueDate = iso === BACK_THE_BLUE_DATE;
              const isSelected = selected.some(
                (d) => dayPickerDateToIso(d) === iso
              );
              const isDisabled =
                props.disabled ||
                props["aria-disabled"] === true ||
                props["aria-disabled"] === "true";

              const mergedStyle: CSSProperties = {
                ...(props.style ?? {}),
                boxSizing: "border-box",
                width: "100%",
                height: "100%",
                maxWidth: "40px",
                maxHeight: "40px",
                minWidth: "40px",
                minHeight: "40px",
                padding: 0,
                margin: "0 auto",
                borderRadius: "10px",
                border: "1px solid transparent",
                backgroundColor: "transparent",
                color: "var(--color-footer)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                transition:
                  "background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease",
                ...(isBlueDate && !isSelected && !isDisabled
                  ? {
                      border: "2px solid #2563eb",
                      backgroundColor: "transparent",
                      color: "#1f2937",
                    }
                  : {}),
                ...(isBlueDate && isSelected && !isDisabled
                  ? {
                      backgroundColor: "#2563eb",
                      color: "#ffffff",
                      border: "1px solid #2563eb",
                    }
                  : {}),
                ...(!isBlueDate && isSelected && !isDisabled
                  ? {
                      backgroundColor: "var(--color-accent-gold)",
                      color: "#000000",
                      border: "1px solid var(--color-accent-gold)",
                    }
                  : {}),
              };

              return (
                <button
                  {...props}
                  style={mergedStyle}
                  className={`${props.className ?? ""} shadow-none`}
                />
              );
            },
          }}
        />
      </div>
    </div>
  );
};

export default DateSelector;
