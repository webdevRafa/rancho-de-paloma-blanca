import { describe, expect, it } from "vitest";
import { evaluatePendingOrderCapacity } from "../../functions/src/pendingOrderResume";

const dates = ["2026-09-04", "2026-09-05"];

describe("pending-order capacity preflight", () => {
  it("allows the saved party when every date still has room", () => {
    expect(
      evaluatePendingOrderCapacity({
        dates,
        partyDeckDates: [],
        numberOfHunters: 4,
        maxHuntersPerDay: 100,
        availabilityByDate: {
          "2026-09-04": { exists: true, huntersBooked: 95 },
          "2026-09-05": { exists: true, huntersBooked: 20 },
        },
      })
    ).toEqual({ ok: true });
  });

  it("blocks checkout when any hunt date no longer has enough capacity", () => {
    expect(
      evaluatePendingOrderCapacity({
        dates,
        partyDeckDates: [],
        numberOfHunters: 6,
        maxHuntersPerDay: 100,
        availabilityByDate: {
          "2026-09-04": { exists: true, huntersBooked: 95 },
          "2026-09-05": { exists: true, huntersBooked: 20 },
        },
      })
    ).toEqual({
      ok: false,
      code: "capacity-unavailable",
      conflictDates: ["2026-09-04"],
    });
  });

  it("blocks checkout when the saved Party Deck date has been taken", () => {
    expect(
      evaluatePendingOrderCapacity({
        dates,
        partyDeckDates: ["2026-09-05"],
        numberOfHunters: 2,
        maxHuntersPerDay: 100,
        availabilityByDate: {
          "2026-09-04": { exists: true, huntersBooked: 10 },
          "2026-09-05": {
            exists: true,
            huntersBooked: 10,
            partyDeckBooked: true,
          },
        },
      })
    ).toEqual({
      ok: false,
      code: "party-deck-unavailable",
      conflictDates: ["2026-09-05"],
    });
  });

  it("fails closed when an availability document is missing", () => {
    expect(
      evaluatePendingOrderCapacity({
        dates,
        partyDeckDates: [],
        numberOfHunters: 2,
        maxHuntersPerDay: 100,
        availabilityByDate: {
          "2026-09-04": { exists: true, huntersBooked: 10 },
          "2026-09-05": { exists: false },
        },
      })
    ).toEqual({
      ok: false,
      code: "availability-unavailable",
      conflictDates: ["2026-09-05"],
    });
  });
});
