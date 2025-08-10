import { useEffect, useMemo, useState } from "react";
import DateSelector from "./DateSelector";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import type { SeasonConfig } from "../types/Types";
import { useCart } from "../context/CartContext";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const EditBookingDatesModal = ({ isOpen, onClose }: Props) => {
  const { booking, setBooking } = useCart();
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);
  const [tempDates, setTempDates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const sc = await getSeasonConfig();
      setSeasonConfig(sc);
    })();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !booking) return;
    setTempDates(booking.dates ?? []);
    setError(null);
  }, [isOpen, booking]);

  const numberOfHunters = useMemo(
    () => booking?.numberOfHunters ?? 1,
    [booking]
  );

  if (!isOpen || !booking) return null;

  const calcPrice = (
    dates: string[],
    hunters: number,
    partyDeckDates: string[]
  ): number => {
    if (!seasonConfig) return 0;
    const {
      seasonStart,
      seasonEnd,
      weekendRates,
      weekdayRate,
      partyDeckRatePerDay,
    } = seasonConfig;

    const toISO = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const dateObjs = dates
      .map((d) => {
        const [y, m, d2] = d.split("-").map(Number);
        return new Date(y, m - 1, d2);
      })
      .sort((a, b) => a.getTime() - b.getTime());

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

    const partyDeckCost = partyDeckRatePerDay * partyDeckDates.length;
    return perPersonTotal * hunters + partyDeckCost;
  };

  const handleSave = () => {
    if (tempDates.length === 0) {
      setError("Please select at least one date.");
      return;
    }
    setSaving(true);
    try {
      const nextDeckDays = (booking.partyDeckDates ?? []).filter((d) =>
        tempDates.includes(d)
      );
      const nextPrice = calcPrice(tempDates, numberOfHunters, nextDeckDays);
      setBooking({
        ...booking,
        dates: tempDates,
        partyDeckDates: nextDeckDays,
        price: nextPrice,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-2xl bg-white text-[var(--color-footer)] rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-footer)]">
          <h3 className="text-lg font-semibold font-acumin">Edit Hunt Dates</h3>
          <button
            onClick={onClose}
            className="text-sm text-[var(--color-footer)] hover:underline"
          >
            Close
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="text-sm text-[var(--color-footer)] mb-3">
            Select or remove dates. Capacity rules are enforced automatically.
          </p>

          <DateSelector
            onSelect={setTempDates}
            seasonConfig={seasonConfig}
            numberOfHunters={numberOfHunters}
          />

          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 pb-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-[var(--color-accent-sage)] text-[var(--color-footer)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md text-white bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditBookingDatesModal;
