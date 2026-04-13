import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import type { PricingWindow, SeasonConfig } from "../types/Types";



export const getSeasonConfig = async (): Promise<SeasonConfig> => {
  const ref = doc(db, "seasonConfig", "active");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("seasonConfig/active not found");
  }

  const data = snap.data() as any;
  const cleanedStart = (data.seasonStart || "").replace(/"/g, "");
  const cleanedEnd = (data.seasonEnd || "").replace(/"/g, "");

  const pricingWindows: PricingWindow[] = Array.isArray(data.pricingWindows)
  ? (data.pricingWindows as any[])
      .map((w): PricingWindow => ({
        start: String(w?.start || "").replace(/"/g, ""),
        end: String(w?.end || "").replace(/"/g, ""),
        type: w?.type === "package" ? "package" : "flat",
        rate: typeof w?.rate === "number" ? w.rate : undefined,
        singleDay: typeof w?.singleDay === "number" ? w.singleDay : undefined,
        twoConsecutiveDays:
          typeof w?.twoConsecutiveDays === "number"
            ? w.twoConsecutiveDays
            : undefined,
        threeDayCombo:
          typeof w?.threeDayCombo === "number" ? w.threeDayCombo : undefined,

        // special-event metadata
        label: typeof w?.label === "string" ? w.label : undefined,
        requiresDisclaimer:
          typeof w?.requiresDisclaimer === "boolean"
            ? w.requiresDisclaimer
            : undefined,
        disclaimerKey:
          typeof w?.disclaimerKey === "string" ? w.disclaimerKey : undefined,
        disclaimerTitle:
          typeof w?.disclaimerTitle === "string" ? w.disclaimerTitle : undefined,
        disclaimerBody:
          typeof w?.disclaimerBody === "string" ? w.disclaimerBody : undefined,
      }))
      .filter(
        (windowItem: PricingWindow) => !!windowItem.start && !!windowItem.end
      )
  : [];

  const hasNewSchema = data.weekendRates && data.weekdayRate !== undefined;

  if (hasNewSchema) {
    return {
      seasonStart: cleanedStart,
      seasonEnd: cleanedEnd,
      weekendRates: {
        singleDay: data.weekendRates.singleDay,
        twoConsecutiveDays:
          data.weekendRates.twoConsecutiveDays ?? data.weekendRates.twoDayCombo,
        threeDayCombo: data.weekendRates.threeDayCombo,
      },
      weekdayRate: data.weekdayRate,
      partyDeckRatePerDay: data.partyDeckRatePerDay,
      maxHuntersPerDay: data.maxHuntersPerDay,
      pricingWindows,
    } as SeasonConfig;
  }

  const seasonRates = data.seasonRates || {};
  return {
    seasonStart: cleanedStart,
    seasonEnd: cleanedEnd,
    weekendRates: {
      singleDay: seasonRates.singleDay ?? seasonRates.weekendSingleDay ?? 0,
      twoConsecutiveDays:
        seasonRates.twoConsecutiveDays ?? seasonRates.twoDayCombo ?? 0,
      threeDayCombo:
        seasonRates.threeDayCombo ?? seasonRates.weekendThreeDayCombo ?? 0,
    },
    weekdayRate: data.offSeasonRate ?? data.weekdayRate ?? 0,
    partyDeckRatePerDay: data.partyDeckRatePerDay,
    maxHuntersPerDay: data.maxHuntersPerDay,
    pricingWindows,
  } as SeasonConfig;
};