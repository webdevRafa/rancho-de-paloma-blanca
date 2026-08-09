import { useEffect, useMemo, useState } from "react";
import DateSelector from "./DateSelector";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import type { SeasonConfig } from "../types/Types";
import { useCart } from "../context/CartContext";
import {
  BACK_THE_BLUE_DATE,
  calculateBookingPricing,
} from "../utils/huntPricing";

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
    return calculateBookingPricing({
      dates,
      hunters,
      partyDeckDates,
      config: seasonConfig,
    }).bookingTotal;
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
