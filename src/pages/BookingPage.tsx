// /pages/BookingPage.tsx (rebuilt with auth gating + AuthModal reuse)
// RDPB — Booking page with friendly sign‑in flow, then booking/cart UX.
//
// • If NOT logged in: show a polished "Sign in / Create account" panel
//   that reuses our <AuthModal /> (email/password) and offers a 1‑click
//   "Continue with Google" action.
// • If logged in: show the original booking experience — either the
//   <BookingForm /> (start a booking) OR a "cart in progress" summary with
//   actions (Go to Checkout, Edit Dates, Clear Cart).
//
// Notes:
// - Uses Tailwind + our CSS vars for the ranch palette.
// - Micro‑motion via Framer Motion for smooth entry/exit.
// - No business logic changed; this is a UX upgrade.
//
// Dependencies already in the project:
//   • context/AuthContext  (exposes: user, loginWithGoogle)
//   • components/AuthModal (props: isOpen, onClose)
//   • components/BookingForm, components/EditBookingDatesModal
//   • utils/formatDate
//
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import AuthModal from "../components/AuthModal";
import BookingForm from "../components/BookingForm";
import EditBookingDatesModal from "../components/EditBookingDatesModal";
import { formatLongDate } from "../utils/formatDate";
import { useCart } from "../context/CartContext";
import dove from "../assets/images/IMG_20250920_191824.webp";
import { PackagesBrochure } from "../components/PackagesBrochure";
import partyDeck from "../assets/images/1000024260.webp";
const BookingPage = () => {
  const navigate = useNavigate();
  const { user, loginWithGoogle } = useAuth();
  const { booking, merchItems, resetCart } = useCart();

  const [authOpen, setAuthOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const hasBooking = !!booking && (booking.dates?.length ?? 0) > 0;
  const hasMerch = useMemo(
    () => Object.keys(merchItems || {}).length > 0,
    [merchItems]
  );
  const cartTotalItems = useMemo(() => {
    const merchCount = Object.values(merchItems || {}).reduce(
      (sum: number, anyItem: any) => {
        const qty = (anyItem?.quantity ?? 0) as number;
        return sum + (Number.isFinite(qty) ? qty : 0);
      },
      0
    );
    const days = booking?.dates?.length ?? 0;
    return merchCount + days;
  }, [merchItems, booking]);
  // iOS doesn't support background-attachment: fixed reliably
  const isIOS = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua);
    const iPadOS =
      navigator.platform === "MacIntel" &&
      (navigator as any).maxTouchPoints > 1;
    return iOS || iPadOS;
  }, []);
  // ---------- 1) AUTH GATE (friendly) ----------
  if (!user) {
    // simple framer-motion variants for a smooth stagger
    const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];
    const container = {
      hidden: { opacity: 0, y: 8 },
      show: {
        opacity: 1,
        y: 0,
        transition: {
          duration: 0.45,
          ease,
          when: "beforeChildren",
          staggerChildren: 0.06,
        },
      },
    };
    const item = {
      hidden: { opacity: 0, y: 10 },
      show: { opacity: 1, y: 0, transition: { duration: 0.35, ease } },
    };

    return (
      <section className="relative min-h-screen overflow-hidden pt-30">
        {/* Hero background */}
        <div
          data-aos="zoom-out"
          className="fixed inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url(${dove})` }}
          aria-hidden="true"
        />
        {/* Subtle vignette + readability overlay */}
        <div
          className="fixed top-0 left-0 w-full h-[100vh] inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/75"
          aria-hidden="true"
        />

        {/* Content */}
        <div className="relative z-10 max-w-[1400px] mx-auto px-4 lg:px-6 pt-28 pb-16">
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid gap-6 lg:grid-cols-[minmax(0,520px)_1fr]"
          >
            {/* Sign-in card */}
            <motion.aside
              variants={item}
              className="rounded-2xl border border-white/15 bg-white/95 backdrop-blur p-6 sm:p-8 shadow-2xl"
            >
              <div className="mb-5">
                <h1 className="text-2xl md:text-3xl font-acumin text-[var(--color-background)]">
                  Sign in to book your hunt
                </h1>
                <p className="mt-2 text-sm md:text-base text-[var(--color-background)]/80">
                  Create an account or sign in to choose your hunt dates, party
                  size, and optional Party Deck. You can also add merch and
                  check out in a single order.
                </p>
              </div>

              {/* CTAs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setAuthOpen(true)}
                  className="w-full rounded-xl bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white font-semibold py-3 transition-colors"
                >
                  Sign in / Create account
                </button>

                <button
                  onClick={async () => {
                    try {
                      await loginWithGoogle();
                    } catch (e) {
                      console.warn(e);
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--color-footer)]/30 bg-white hover:bg-neutral-50 text-[var(--color-background)] font-semibold py-3 transition-colors"
                  aria-label="Continue with Google"
                  title="Continue with Google"
                >
                  Continue with Google
                </button>
              </div>

              {/* Trust bullets */}
              <ul className="mt-6 space-y-2 text-sm text-[var(--color-background)]/80">
                <li>
                  • No spam — we use your account to keep bookings and receipts
                  in one place.
                </li>
                <li>
                  • You’ll see availability in real time and package pricing for
                  in-season weekends.
                </li>
                <li>
                  • Pay securely online; your spots are confirmed after payment.
                </li>
              </ul>

              {/* Tiny reassurance footer */}
              <div className="mt-5 rounded-xl border border-[var(--color-footer)]/30 bg-white/70 text-[var(--color-background)]/80 p-3 text-xs">
                Having trouble? Try the Google sign-in option or contact us and
                we’ll get you squared away.
              </div>
            </motion.aside>

            {/* Packages / pricing brochure (kept as your existing component) */}
            <motion.div variants={item}>
              <PackagesBrochure />
            </motion.div>
          </motion.div>
        </div>

        {/* Global auth modal (unchanged) */}
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </section>
    );
  }

  // ---------- 2) BOOKING / CART UX (for signed‑in users) ----------
  return (
    <div className="relative">
      {/* Hero banner (subtle) */}

      <div className="w-full  min-h-screen mx-auto px-4 relative flex items-center justify-center">
        <AnimatePresence mode="wait">
          {!hasBooking && cartTotalItems === 0 ? (
            // No cart yet — show the booking form
            <div className="relative z-20 peer">
              {" "}
              {/* ⬅️ becomes the hover source */}
              <motion.div
                key="booking-form"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ duration: 0.4 }}
                className="py-2"
              >
                <BookingForm />
              </motion.div>
            </div>
          ) : (
            // Cart‑in‑progress panel replaces the form
            <motion.div
              key="cart-blocker"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.4 }}
              className="bg-white max-w-[800px] mx-auto  z-40 relative rounded-b-2xl shadow-2xl p-6 md:p-8 border border-white/10 mt-10"
            >
              <h2 className="text-2xl md:text-3xl text-[var(--color-background)] font-acumin mb-2">
                You’ve got a cart in progress
              </h2>
              <p className="text-sm text-[var(--color-background)]/80 mb-6">
                You already started a booking and/or added merchandise. Finish
                checkout or edit your dates below. If you want to start over,
                you can clear your cart.
              </p>

              <div className="space-y-3 text-sm">
                {hasBooking && (
                  <div className="rounded-md p-4 bg-neutral-100 border border-black/5">
                    <p className="font-semibold text-[var(--color-footer)] text-base mb-1">
                      Current Booking
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-black/10">
                        {booking?.numberOfHunters ?? 1} hunter
                        {(booking?.numberOfHunters ?? 1) > 1 ? "s" : ""}
                      </span>
                      {booking?.dates?.map((d: string) => (
                        <span
                          key={d}
                          className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-black/10"
                        >
                          {formatLongDate(d)}
                        </span>
                      ))}
                    </div>
                    {booking?.partyDeckDates?.length ? (
                      <p className="mt-2 text-[var(--color-background)]/80">
                        Party Deck reserved for:{" "}
                        <span className="font-medium">
                          {booking.partyDeckDates
                            .map((d: string) => formatLongDate(d))
                            .join(", ")}
                        </span>
                      </p>
                    ) : null}
                  </div>
                )}

                {hasMerch && (
                  <div className="rounded-md p-4 bg-neutral-100 border border-black/5">
                    <p className="font-semibold text-[var(--color-footer)] text-base mb-1">
                      Merchandise
                    </p>
                    <p className="text-[var(--color-background)]/80">
                      {Object.values(merchItems || {}).length} item(s) in cart.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate("/checkout")}
                  className="flex-1 bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white px-3 py-3 rounded-md font-semibold text-sm transition-colors"
                >
                  Go to Checkout
                </button>

                {hasBooking && (
                  <button
                    onClick={() => setEditOpen(true)}
                    className="flex-1 bg-[var(--color-accent-gold,#B38E35)]/15 hover:bg-[var(--color-accent-gold,#B38E35)]/25 text-[var(--color-footer)] px-3 py-3 rounded-md font-semibold text-sm transition-colors"
                  >
                    Edit Dates
                  </button>
                )}

                <button
                  onClick={resetCart}
                  className="flex-1 bg-[var(--color-footer)] hover:opacity-90 text-white px-3 py-3 rounded-md text-sm transition-colors"
                  title="Clear everything and start over"
                >
                  Clear Cart & Start Over
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div
          className="absolute inset-0 z-10"
          style={{
            backgroundImage: `url(${partyDeck})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundAttachment: isIOS ? "scroll" : "fixed",
            opacity: 0.4,
          }}
          aria-hidden="true"
        />
      </div>

      {/* Edit dates directly from here */}
      {hasBooking && (
        <EditBookingDatesModal
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
};

export default BookingPage;
