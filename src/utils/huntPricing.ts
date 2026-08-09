import type { PricingWindow, SeasonConfig } from "../types/Types";

export const BACK_THE_BLUE_DATE = "2026-10-03";

export type BookingPricingBreakdown = {
  bookingTotal: number;
  huntSubtotal: number;
  invalidDates: string[];
  partyDeckSubtotal: number;
  perHunterDailyRates: Record<string, number>;
};

const uniqueSortedDates = (dates: string[]) => [...new Set(dates)].sort();

const parseIsoDateLocal = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const isConsecutive = (first: string, second: string) => {
  const firstDate = parseIsoDateLocal(first);
  const secondDate = parseIsoDateLocal(second);
  return secondDate.getTime() - firstDate.getTime() === 86_400_000;
};

const samePricingWindow = (
  first: PricingWindow | null,
  second: PricingWindow | null
) => {
  if (!first || !second) return false;
  if (first === second) return true;

  return (
    first.start === second.start &&
    first.end === second.end &&
    first.type === second.type &&
    first.rate === second.rate &&
    first.singleDay === second.singleDay &&
    first.twoConsecutiveDays === second.twoConsecutiveDays &&
    first.threeDayCombo === second.threeDayCombo
  );
};

export const isDateInActiveSeason = (iso: string, config: SeasonConfig) =>
  iso >= config.seasonStart && iso <= config.seasonEnd;

export const getPricingWindowForDate = (
  iso: string,
  config: SeasonConfig
): PricingWindow | null =>
  (config.pricingWindows ?? []).find(
    (window) => iso >= window.start && iso <= window.end
  ) ?? null;

export const getFallbackSingleDayRate = (
  iso: string,
  config: SeasonConfig
) => {
  const dayOfWeek = parseIsoDateLocal(iso).getDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;

  if (isWeekend) {
    return config.weekendRates?.singleDay ?? config.weekdayRate ?? 0;
  }

  return config.weekdayRate ?? 0;
};

const getSingleDayRate = (
  iso: string,
  window: PricingWindow,
  config: SeasonConfig
) => window.singleDay ?? window.rate ?? getFallbackSingleDayRate(iso, config);

/**
 * Builds the per-hunter rate for every valid selected date. Legacy package
 * windows remain supported so this code can deploy before the Firestore
 * cutover. The flat-price configuration takes the simpler one-rate-per-date
 * path, including the one-day Back the Blue exception.
 */
export const buildPerHunterDailyRateMap = (
  dates: string[],
  config: SeasonConfig
) => {
  const sortedDates = uniqueSortedDates(dates).filter((iso) =>
    isDateInActiveSeason(iso, config)
  );
  const rateMap: Record<string, number> = {};

  for (let index = 0; index < sortedDates.length; ) {
    const firstDate = sortedDates[index];
    const secondDate = sortedDates[index + 1];
    const thirdDate = sortedDates[index + 2];
    const firstWindow = getPricingWindowForDate(firstDate, config);
    const secondWindow = secondDate
      ? getPricingWindowForDate(secondDate, config)
      : null;
    const thirdWindow = thirdDate
      ? getPricingWindowForDate(thirdDate, config)
      : null;

    if (firstWindow?.type === "package") {
      const canUseThreeDayPackage =
        !!secondDate &&
        !!thirdDate &&
        samePricingWindow(firstWindow, secondWindow) &&
        samePricingWindow(secondWindow, thirdWindow) &&
        isConsecutive(firstDate, secondDate) &&
        isConsecutive(secondDate, thirdDate);

      if (canUseThreeDayPackage) {
        const packageTotal =
          firstWindow.threeDayCombo ??
          getSingleDayRate(firstDate, firstWindow, config) +
            getSingleDayRate(secondDate, firstWindow, config) +
            getSingleDayRate(thirdDate, firstWindow, config);
        const dailyRate = packageTotal / 3;
        rateMap[firstDate] = dailyRate;
        rateMap[secondDate] = dailyRate;
        rateMap[thirdDate] = dailyRate;
        index += 3;
        continue;
      }

      const canUseTwoDayPackage =
        !!secondDate &&
        samePricingWindow(firstWindow, secondWindow) &&
        isConsecutive(firstDate, secondDate);

      if (canUseTwoDayPackage) {
        const packageTotal =
          firstWindow.twoConsecutiveDays ??
          getSingleDayRate(firstDate, firstWindow, config) +
            getSingleDayRate(secondDate, firstWindow, config);
        const dailyRate = packageTotal / 2;
        rateMap[firstDate] = dailyRate;
        rateMap[secondDate] = dailyRate;
        index += 2;
        continue;
      }

      rateMap[firstDate] = getSingleDayRate(
        firstDate,
        firstWindow,
        config
      );
      index += 1;
      continue;
    }

    rateMap[firstDate] =
      firstWindow?.rate ?? getFallbackSingleDayRate(firstDate, config);
    index += 1;
  }

  return rateMap;
};

export const calculateHuntSubtotal = (
  dates: string[],
  hunters: number,
  config: SeasonConfig
) => {
  const hunterCount = Number.isFinite(hunters) ? Math.max(0, hunters) : 0;
  const rates = buildPerHunterDailyRateMap(dates, config);
  return Object.values(rates).reduce(
    (total, rate) => total + rate * hunterCount,
    0
  );
};

export const calculateBookingPricing = (args: {
  dates: string[];
  hunters: number;
  partyDeckDates?: string[];
  config: SeasonConfig;
}): BookingPricingBreakdown => {
  const { dates, hunters, partyDeckDates = [], config } = args;
  const uniqueDates = uniqueSortedDates(dates);
  const invalidDates = uniqueDates.filter(
    (iso) => !isDateInActiveSeason(iso, config)
  );
  const perHunterDailyRates = buildPerHunterDailyRateMap(uniqueDates, config);
  const hunterCount = Number.isFinite(hunters) ? Math.max(0, hunters) : 0;
  const huntSubtotal = Object.values(perHunterDailyRates).reduce(
    (total, rate) => total + rate * hunterCount,
    0
  );
  const partyDeckSubtotal =
    new Set(partyDeckDates).size * (config.partyDeckRatePerDay ?? 0);

  return {
    bookingTotal: huntSubtotal + partyDeckSubtotal,
    huntSubtotal,
    invalidDates,
    partyDeckSubtotal,
    perHunterDailyRates,
  };
};
