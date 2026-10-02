import { describe, expect, it } from "vitest";
import { getBookingCalendarDate } from "./bookingCalendar";

describe("booking calendar opening date", () => {
  it.each([
    ["2026-08-15", "2026-09-01"],
    ["2026-09-20", "2026-09-20"],
    ["2026-10-02", "2026-10-02"],
    ["2026-10-25", "2026-10-25"],
    ["2026-11-01", "2026-10-25"],
  ])("opens within the season when today is %s", (today, expected) => {
    expect(getBookingCalendarDate(today, "2026-09-01", "2026-10-25")).toBe(expected);
  });

  it("uses configured boundaries rather than hardcoding October 2026", () => {
    expect(getBookingCalendarDate("2027-08-01", "2027-09-01", "2027-10-25"))
      .toBe("2027-09-01");
  });

  it("opens to today while configuration is loading", () => {
    expect(getBookingCalendarDate("2026-10-02", "", "")).toBe("2026-10-02");
  });
});
