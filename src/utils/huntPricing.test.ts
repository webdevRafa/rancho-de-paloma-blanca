import { describe, expect, it } from "vitest";
import type { SeasonConfig } from "../types/Types";
import {
  calculateBookingPricing,
  calculateHuntSubtotal,
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
      end: "2026-10-02",
      type: "flat",
      rate: 150,
    },
    {
      start: "2026-10-03",
      end: "2026-10-03",
      type: "flat",
      rate: 50,
      label: "Back the Blue",
      requiresDisclaimer: true,
    },
    {
      start: "2026-10-04",
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

  it("keeps October 3 at $50 per hunter", () => {
    expect(calculateHuntSubtotal(["2026-10-03"], 4, flatConfig)).toBe(200);
  });

  it("prices a selection across the special event one day at a time", () => {
    expect(
      calculateHuntSubtotal(
        ["2026-10-02", "2026-10-03", "2026-10-04"],
        2,
        flatConfig
      )
    ).toBe(700);
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
