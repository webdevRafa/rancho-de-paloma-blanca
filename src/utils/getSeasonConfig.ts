// utils/getSeasonConfig.ts
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import type { SeasonConfig } from "../types/Types";

export const getSeasonConfig = async (): Promise<SeasonConfig> => {
  const ref = doc(db, "seasonConfig", "active");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("seasonConfig/active not found");
  }
  // Firestore documents may contain legacy field names or extra quotes
  // around the seasonStart and seasonEnd strings. Normalise the data
  // structure here to match the SeasonConfig interface.
  const data = snap.data() as any;
  // Extract raw fields with fallback names. If weekendRates and
  // weekdayRate are present, assume the document uses the new schema.
  const hasNewSchema = data.weekendRates && data.weekdayRate !== undefined;
  const cleanedStart = (data.seasonStart || "").replace(/"/g, "");
  const cleanedEnd = (data.seasonEnd || "").replace(/"/g, "");
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
    } as SeasonConfig;
  }
  // Legacy schema: map seasonRates/offSeasonRate to the new names
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
  } as SeasonConfig;
};