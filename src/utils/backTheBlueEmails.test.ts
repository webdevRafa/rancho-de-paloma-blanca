import { describe, expect, it } from "vitest";
import {
  renderAdminOrderPaidEmail,
  renderOrderPaidEmail,
  renderPendingOrderEmail,
  type OrderEmailDetails,
} from "../../functions/src/email/templates";

const order: OrderEmailDetails = {
  orderId: "event-test-order",
  total: 100,
  dashboardUrl: "https://www.ranchodepalomablanca.com/dashboard",
  adminUrl: "https://www.ranchodepalomablanca.com/admin",
  customer: { firstName: "Demo", lastName: "Hunter" },
  booking: {
    dates: ["2026-10-10"],
    numberOfHunters: 2,
    attendees: [{ fullName: "Demo Hunter" }, { fullName: "Demo Guest" }],
  },
};

describe.each([
  ["customer reminder", renderPendingOrderEmail],
  ["customer confirmation", renderOrderPaidEmail],
  ["admin confirmation", renderAdminOrderPaidEmail],
] as const)("%s event details", (_name, render) => {
  it("includes the new date, guests, attendee names, and saved amount", () => {
    const email = render(order);
    expect(email.html).toContain("Back the Blue · October 10, 2026");
    expect(email.text).toContain("BACK THE BLUE — OCTOBER 10, 2026");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("first responders and their guests");
      expect(body).toContain("Demo Hunter");
      expect(body).toContain("Demo Guest");
      expect(body).toContain("$100.00");
      expect(body).not.toContain("October 3, 2026");
    }
  });

  it("does not silently reschedule or reprice an existing October 3 order", () => {
    const original = { ...order, booking: { ...order.booking, dates: ["2026-10-03"] } };
    const email = render(original);
    expect(email.text).toContain("October 3, 2026");
    expect(email.text).toContain("$100.00");
    expect(email.text).not.toContain("October 10");
    expect(email.text).not.toContain("BACK THE BLUE —");
    expect(original.booking.dates).toEqual(["2026-10-03"]);
  });
});
