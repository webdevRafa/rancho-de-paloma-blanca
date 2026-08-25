export type PendingOrderAvailability = {
  exists: boolean;
  huntersBooked?: unknown;
  partyDeckBooked?: unknown;
};

export type PendingOrderCapacityResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "configuration-unavailable"
        | "availability-unavailable"
        | "capacity-unavailable"
        | "party-deck-unavailable";
      conflictDates: string[];
    };

type EvaluatePendingOrderCapacityArgs = {
  dates: string[];
  partyDeckDates: string[];
  numberOfHunters: number;
  maxHuntersPerDay: number;
  availabilityByDate: Record<string, PendingOrderAvailability | undefined>;
};

/**
 * Pure capacity preflight for resuming an unpaid order. Pending orders do not
 * reserve inventory, so the saved party size must still fit in the live
 * availability snapshot before a fresh payment token is issued.
 */
export function evaluatePendingOrderCapacity({
  dates,
  partyDeckDates,
  numberOfHunters,
  maxHuntersPerDay,
  availabilityByDate,
}: EvaluatePendingOrderCapacityArgs): PendingOrderCapacityResult {
  if (!Number.isFinite(maxHuntersPerDay) || maxHuntersPerDay <= 0) {
    return {
      ok: false,
      code: "configuration-unavailable",
      conflictDates: [],
    };
  }

  const uniqueDates = Array.from(new Set(dates.filter(Boolean)));
  const deckDateSet = new Set(partyDeckDates.filter(Boolean));
  const unavailableDates: string[] = [];
  const capacityDates: string[] = [];
  const partyDeckConflicts: string[] = [];

  for (const date of uniqueDates) {
    const availability = availabilityByDate[date];
    if (
      !availability?.exists ||
      typeof availability.huntersBooked !== "number" ||
      !Number.isFinite(availability.huntersBooked)
    ) {
      unavailableDates.push(date);
      continue;
    }

    if (availability.huntersBooked + numberOfHunters > maxHuntersPerDay) {
      capacityDates.push(date);
    }

    if (deckDateSet.has(date)) {
      if (typeof availability.partyDeckBooked !== "boolean") {
        unavailableDates.push(date);
      } else if (availability.partyDeckBooked) {
        partyDeckConflicts.push(date);
      }
    }
  }

  if (unavailableDates.length > 0) {
    return {
      ok: false,
      code: "availability-unavailable",
      conflictDates: Array.from(new Set(unavailableDates)),
    };
  }

  if (capacityDates.length > 0) {
    return {
      ok: false,
      code: "capacity-unavailable",
      conflictDates: capacityDates,
    };
  }

  if (partyDeckConflicts.length > 0) {
    return {
      ok: false,
      code: "party-deck-unavailable",
      conflictDates: partyDeckConflicts,
    };
  }

  return { ok: true };
}
