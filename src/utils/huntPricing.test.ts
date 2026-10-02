import { describe, expect, it } from "vitest";
import type { SeasonConfig } from "../types/Types";
import {
  BACK_THE_BLUE_DATE,
  calculateBookingPricing,
  calculateHuntSubtotal,
  getEventScheduleNotice,
  getPricingWindowForDate,
} from "./huntPricing";

const flatConfig: SeasonConfig = {
  seasonStart: "2026-09-01",
  seasonEnd: "2026-10-25",
  weekdayRate: 150,
  weekendRates: {
    singleDay: 150,
    twoConsecutiveDays: 300,
    threeDayCombo: 450,
  },
  partyDeckRatePerDay: 500,
  maxHuntersPerDay: 100,
  pricingWindows: [
    {
      start: "2026-09-01",
      end: "2026-10-09",
      type: "flat",
      rate: 150,
    },
    {
      start: "2026-10-10",
      end: "2026-10-10",
      type: "flat",
      rate: 50,
      label: "Back the Blue",
      requiresDisclaimer: true,
    },
    {
      start: "2026-10-11",
      end: "2026-10-25",
      type: "flat",
      rate: 150,
    },
  ],
};

describe("flat hunt pricing", () => {
  it("charges $150 for every normal hunter-day", () => {
    expect(calculateHuntSubtotal(["2026-09-01"], 1, flatConfig)).toBe(150);
    expect(
      calculateHuntSubtotal(
        ["2026-09-04", "2026-09-05", "2026-09-06"],
        2,
        flatConfig
      )
    ).toBe(900);
  });

  it("charges the event rate only on October 10", () => {
    expect(BACK_THE_BLUE_DATE).toBe("2026-10-10");
    expect(calculateHuntSubtotal(["2026-10-10"], 4, flatConfig)).toBe(200);
    expect(calculateHuntSubtotal(["2026-10-03"], 4, flatConfig)).toBe(600);
    expect(getPricingWindowForDate("2026-10-10", flatConfig)?.requiresDisclaimer).toBe(true);
    expect(getPricingWindowForDate("2026-10-03", flatConfig)?.requiresDisclaimer).not.toBe(true);
  });

  it("prices a selection across the special event one day at a time", () => {
    expect(
      calculateHuntSubtotal(
        ["2026-10-09", "2026-10-10", "2026-10-11"],
        2,
        flatConfig
      )
    ).toBe(700);
  });

  it("covers every season day exactly once with the expected rate", () => {
    for (let day = new Date("2026-09-01T12:00:00Z"); day <= new Date("2026-10-25T12:00:00Z"); day.setUTCDate(day.getUTCDate() + 1)) {
      const iso = day.toISOString().slice(0, 10);
      expect(flatConfig.pricingWindows?.filter((window) => iso >= window.start && iso <= window.end)).toHaveLength(1);
      expect(calculateHuntSubtotal([iso], 1, flatConfig)).toBe(iso === BACK_THE_BLUE_DATE ? 50 : 150);
    }
  });

  it("adds the Party Deck once per selected deck day", () => {
    const result = calculateBookingPricing({
      dates: ["2026-09-01"],
      hunters: 2,
      partyDeckDates: ["2026-09-01"],
      config: flatConfig,
    });

    expect(result.huntSubtotal).toBe(300);
    expect(result.partyDeckSubtotal).toBe(500);
    expect(result.bookingTotal).toBe(800);
  });

  it("reports and excludes dates outside the active season", () => {
    const result = calculateBookingPricing({
      dates: ["2026-08-31", "2026-09-01", "2026-10-26"],
      hunters: 1,
      config: flatConfig,
    });

    expect(result.invalidDates).toEqual(["2026-08-31", "2026-10-26"]);
    expect(result.bookingTotal).toBe(150);
  });
});

describe("event schedule cutover", () => {
  const oldConfig: SeasonConfig = {
    ...flatConfig,
    pricingWindows: [
      { start: "2026-09-01", end: "2026-10-02", type: "flat", rate: 150 },
      { start: "2026-10-03", end: "2026-10-03", type: "flat", rate: 50, requiresDisclaimer: true },
      { start: "2026-10-04", end: "2026-10-25", type: "flat", rate: 150 },
    ],
  };

  it("pauses affected new bookings while Firestore still uses October 3", () => {
    expect(getEventScheduleNotice(["2026-10-03"], oldConfig)).toContain("October 10");
    expect(getEventScheduleNotice(["2026-10-10"], oldConfig)).toContain("October 10");
    expect(getEventScheduleNotice(["2026-10-17"], oldConfig)).toBeNull();
  });

  it("blocks an overlapping event window even if the event was moved", () => {
    const overlap: SeasonConfig = {
      ...oldConfig,
      pricingWindows: [
        oldConfig.pricingWindows![0],
        flatConfig.pricingWindows![1],
        oldConfig.pricingWindows![2],
      ],
    };
    expect(getEventScheduleNotice(["2026-10-10"], overlap)).not.toBeNull();
  });

  it("allows the corrected schedule without mutating the config or saved dates", () => {
    const dates = ["2026-10-03", "2026-10-09", "2026-10-10", "2026-10-11"];
    const before = JSON.stringify(flatConfig);
    expect(getEventScheduleNotice(dates, flatConfig)).toBeNull();
    expect(dates).toEqual(["2026-10-03", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(JSON.stringify(flatConfig)).toBe(before);
  });
});

describe("legacy package compatibility", () => {
  const packageConfig: SeasonConfig = {
    ...flatConfig,
    pricingWindows: [
      {
        start: "2026-09-04",
        end: "2026-09-06",
        type: "package",
        singleDay: 200,
        twoConsecutiveDays: 350,
        threeDayCombo: 450,
      },
    ],
  };

  it("continues to interpret existing package windows before cutover", () => {
    expect(
      calculateHuntSubtotal(
        ["2026-09-04", "2026-09-05"],
        1,
        packageConfig
      )
    ).toBe(350);
    expect(
      calculateHuntSubtotal(
        ["2026-09-04", "2026-09-05", "2026-09-06"],
        1,
        packageConfig
      )
    ).toBe(450);
  });
});
