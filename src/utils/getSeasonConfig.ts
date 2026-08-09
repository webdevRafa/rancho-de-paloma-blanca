import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import type { PricingWindow, SeasonConfig } from "../types/Types";

const ARCHIVED_PRICING_DOCUMENT = "2026-before-flat-pricing";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : {};

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asOptionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const cleanIsoDate = (value: unknown) => String(value ?? "").replace(/"/g, "");

export const normalizeSeasonConfig = (value: unknown): SeasonConfig => {
  const data = asRecord(value);
  const rawWindows = Array.isArray(data.pricingWindows)
    ? data.pricingWindows
    : [];
  const pricingWindows = rawWindows
    .map((rawWindow): PricingWindow => {
      const window = asRecord(rawWindow);

      return {
        start: cleanIsoDate(window.start),
        end: cleanIsoDate(window.end),
        type: window.type === "package" ? "package" : "flat",
        rate:
          typeof window.rate === "number" ? window.rate : undefined,
        singleDay:
          typeof window.singleDay === "number" ? window.singleDay : undefined,
        twoConsecutiveDays:
          typeof window.twoConsecutiveDays === "number"
            ? window.twoConsecutiveDays
            : undefined,
        threeDayCombo:
          typeof window.threeDayCombo === "number"
            ? window.threeDayCombo
            : undefined,
        label: asOptionalString(window.label),
        requiresDisclaimer:
          typeof window.requiresDisclaimer === "boolean"
            ? window.requiresDisclaimer
            : undefined,
        disclaimerKey: asOptionalString(window.disclaimerKey),
        disclaimerTitle: asOptionalString(window.disclaimerTitle),
        disclaimerBody: asOptionalString(window.disclaimerBody),
      };
    })
    .filter((window) => Boolean(window.start && window.end));

  const weekendRates = asRecord(data.weekendRates);
  const seasonRates = asRecord(data.seasonRates);
  const usesCurrentSchema =
    Object.keys(weekendRates).length > 0 && typeof data.weekdayRate === "number";

  if (usesCurrentSchema) {
    return {
      seasonStart: cleanIsoDate(data.seasonStart),
      seasonEnd: cleanIsoDate(data.seasonEnd),
      weekendRates: {
        singleDay: asNumber(weekendRates.singleDay),
        twoConsecutiveDays: asNumber(
          weekendRates.twoConsecutiveDays,
          asNumber(weekendRates.twoDayCombo)
        ),
        threeDayCombo: asNumber(weekendRates.threeDayCombo),
      },
      weekdayRate: asNumber(data.weekdayRate),
      partyDeckRatePerDay: asNumber(data.partyDeckRatePerDay),
      maxHuntersPerDay: asNumber(data.maxHuntersPerDay),
      pricingWindows,
    };
  }

  return {
    seasonStart: cleanIsoDate(data.seasonStart),
    seasonEnd: cleanIsoDate(data.seasonEnd),
    weekendRates: {
      singleDay: asNumber(
        seasonRates.singleDay,
        asNumber(seasonRates.weekendSingleDay)
      ),
      twoConsecutiveDays: asNumber(
        seasonRates.twoConsecutiveDays,
        asNumber(seasonRates.twoDayCombo)
      ),
      threeDayCombo: asNumber(
        seasonRates.threeDayCombo,
        asNumber(seasonRates.weekendThreeDayCombo)
      ),
    },
    weekdayRate: asNumber(data.offSeasonRate, asNumber(data.weekdayRate)),
    partyDeckRatePerDay: asNumber(data.partyDeckRatePerDay),
    maxHuntersPerDay: asNumber(data.maxHuntersPerDay),
    pricingWindows,
  };
};

export const getSeasonConfig = async (): Promise<SeasonConfig> => {
  const snapshot = await getDoc(doc(db, "seasonConfig", "active"));

  if (!snapshot.exists()) {
    throw new Error("seasonConfig/active not found");
  }

  return normalizeSeasonConfig(snapshot.data());
};

export const getArchivedSeasonConfig = async (): Promise<SeasonConfig | null> => {
  try {
    const snapshot = await getDoc(
      doc(db, "seasonConfigArchive", ARCHIVED_PRICING_DOCUMENT)
    );

    if (!snapshot.exists()) return null;
    return normalizeSeasonConfig(snapshot.data().config);
  } catch (error) {
    console.warn("Archived season pricing could not be loaded:", error);
    return null;
  }
};
