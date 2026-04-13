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
  const BACK_THE_BLUE_DATE = "2026-10-03";

  const { booking, setBooking } = useCart();
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);
  const [tempDates, setTempDates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBackTheBlueDisclaimer, setShowBackTheBlueDisclaimer] =
    useState(false);
  const [backTheBlueAccepted, setBackTheBlueAccepted] = useState(false);

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
    setBackTheBlueAccepted(booking.backTheBlueAccepted ?? false);
    setError(null);
  }, [isOpen, booking]);

  const numberOfHunters = useMemo(
    () => booking?.numberOfHunters ?? 1,
    [booking]
  );

  const sortIsoDates = (dates: string[]) =>
    [...dates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const isConsecutive = (d0: string, d1: string): boolean => {
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

  const getPricingWindowForDate = (iso: string, cfg: SeasonConfig | null) => {
    if (!cfg) return null;
    return (
      cfg.pricingWindows?.find((w) => inRange(iso, w.start, w.end)) ?? null
    );
  };

  const samePricingWindow = (a: any, b: any) => {
    if (!a || !b) return false;
    return a.start === b.start && a.end === b.end && a.type === b.type;
  };

  const isDateInActiveSeason = (iso: string, cfg: SeasonConfig | null) => {
    if (!cfg?.seasonStart || !cfg?.seasonEnd) return false;
    return inRange(iso, cfg.seasonStart, cfg.seasonEnd);
  };

  const backTheBlueWindow = seasonConfig?.pricingWindows?.find(
    (w) => w.start === BACK_THE_BLUE_DATE && w.end === BACK_THE_BLUE_DATE
  );

  const backTheBlueSelected = tempDates.includes(BACK_THE_BLUE_DATE);

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

  if (!isOpen || !booking) return null;

  const calcPrice = (
    dates: string[],
    hunters: number,
    partyDeckDates: string[]
  ): number => {
    if (!seasonConfig) return 0;

    const validDates = sortIsoDates(
      dates.filter((iso) => isDateInActiveSeason(iso, seasonConfig))
    );

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

    const partyDeckCost =
      (seasonConfig.partyDeckRatePerDay ?? 500) * partyDeckDates.length;

    return bookingTotal + partyDeckCost;
  };

  const handleSave = () => {
    if (tempDates.length === 0) {
      setError("Please select at least one date.");
      return;
    }

    if (backTheBlueSelected && !backTheBlueAccepted) {
      setShowBackTheBlueDisclaimer(true);
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
        backTheBlueAccepted,
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

          {seasonConfig ? (
            <DateSelector
              onSelect={setTempDates}
              seasonConfig={seasonConfig}
              numberOfHunters={numberOfHunters}
              selectedDates={tempDates}
            />
          ) : (
            <div className="py-10 text-center text-sm text-[var(--color-footer)]/70">
              Loading available dates…
            </div>
          )}

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

        {showBackTheBlueDisclaimer && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                  {backTheBlueWindow?.label || "Special Event Notice"}
                </p>
                <h3 className="mt-2 text-2xl font-acumin text-[var(--color-footer)]">
                  {backTheBlueWindow?.disclaimerTitle ||
                    "First responder confirmation required"}
                </h3>
              </div>

              <p className="text-sm leading-7 text-[var(--color-footer)]/85">
                {backTheBlueWindow?.disclaimerBody ||
                  "By selecting October 3rd, 2026, you confirm that all hunters on this booking qualify as first responders. Proof will be required at check-in. Anyone unable to provide proof will be turned away with no refund."}
              </p>

              <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
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
        )}
      </div>
    </div>
  );
};

export default EditBookingDatesModal;
