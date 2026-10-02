import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import BookingPage from "../pages/BookingPage";
import BackTheBlueEventCard from "../components/BackTheBlueEventCard";

const auth = vi.hoisted(() => ({
  user: null as null | { uid: string; displayName: string; email: string },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user, login: vi.fn(), loginWithGoogle: vi.fn() }),
}));
vi.mock("../context/CartContext", () => ({
  useCart: () => ({
    booking: null,
    merchItems: {},
    resetCart: vi.fn(),
    setBooking: vi.fn(),
  }),
}));
// Rendering tests must not connect to production Firebase.
vi.mock("../firebase/firebaseConfig", () => ({ db: {} }));

describe("booking page event announcement", () => {
  it.each([false, true])("shows October 10 with signedIn=%s", (signedIn) => {
    auth.user = signedIn
      ? { uid: "test-user", displayName: "Demo Hunter", email: "demo@example.test" }
      : null;
    const html = renderToStaticMarkup(
      <MemoryRouter><BookingPage /></MemoryRouter>
    );
    expect(html).toContain("October 10");
    expect(html).not.toContain("October 3");
    expect(html).toContain("first responders and their guests");
    expect(html).toContain("$50");
    expect(html).toContain("Brownsville and Rio Hondo, Texas");
    expect(html).toContain("Contact the ranch to confirm the location for your hunt.");
    expect(html).toContain("100 hunters per day across both locations combined");
    expect(html).toContain(signedIn ? "Enter Party Size" : "Sign in to see live availability.");
  });

  it("uses current text instead of the outdated printed flyer", () => {
    const html = renderToStaticMarkup(<BackTheBlueEventCard />);
    expect(html).toContain("October 10, 2026");
    expect(html).toContain("Ranch locations: Brownsville and Rio Hondo, Texas");
    expect(html).toContain("Contact the ranch to confirm the location for your hunt.");
    expect(html).toContain("first responders and their guests");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("October 3");
  });
});
