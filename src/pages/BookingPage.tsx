import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  LogIn,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import AuthModal from "../components/AuthModal";
import BookingForm from "../components/BookingForm";
import EditBookingDatesModal from "../components/EditBookingDatesModal";
import { PackagesBrochure } from "../components/PackagesBrochure";
import { formatLongDate } from "../utils/formatDate";
import hunter from "../assets/images/IMG_5574.webp";
import hunters from "../assets/images/IMG_5547.webp";
import "./BookingPage.css";

const EASE = [0.16, 1, 0.3, 1] as const;

const BookingPage = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { user, loginWithGoogle } = useAuth();
  const { booking, merchItems, resetCart } = useCart();

  const [authOpen, setAuthOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const hasBooking = Boolean(booking?.dates?.length);
  const hasMerch = useMemo(
    () => Object.keys(merchItems || {}).length > 0,
    [merchItems]
  );
  const cartTotalItems = useMemo(() => {
    const merchCount = Object.values(merchItems || {}).reduce((sum, item) => {
      const quantity = item.quantity ?? 0;
      return sum + (Number.isFinite(quantity) ? quantity : 0);
    }, 0);
    const huntDays = booking?.dates?.length ?? 0;
    return merchCount + huntDays;
  }, [merchItems, booking]);

  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";
  const showFreshBooking = Boolean(user) && !hasBooking && cartTotalItems === 0;
  const heroImage = user ? hunters : hunter;

  const reveal = {
    initial: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0 : 0.7, ease: EASE },
  };

  return (
    <main className="booking-page">
      <section className="booking-hero" aria-labelledby="booking-title">
        <img
          className="booking-hero__image"
          src={heroImage}
          alt="Dove hunters in the field at Rancho de Paloma Blanca"
          fetchPriority="high"
        />
        <div className="booking-hero__wash" aria-hidden="true" />
        <div className="booking-hero__grain" aria-hidden="true" />

        <div className="booking-shell booking-hero__grid">
          <motion.div className="booking-hero__copy" {...reveal}>
            <p className="booking-eyebrow">
              <CalendarDays aria-hidden="true" />
              2026 Dove Hunting Season
            </p>
            <h1 id="booking-title">
              Plan your day
              <span>in the field.</span>
            </h1>
            <p className="booking-hero__lede">
              Choose an available date from September 1 through October 25.
              Standard hunts are $150 per hunter, per day, with the special
              Back the Blue hunt on October 3 at $50 per hunter, per day.
            </p>

            <div className="booking-facts" aria-label="2026 season overview">
              <div className="booking-fact">
                <span>Season</span>
                <strong>Sep 1 — Oct 25</strong>
              </div>
              <div className="booking-fact">
                <span>Standard rate</span>
                <strong>$150 / hunter / day</strong>
              </div>
              <div className="booking-fact">
                <span>Daily capacity</span>
                <strong>Up to 100 hunters</strong>
              </div>
              <div className="booking-fact booking-fact--blue">
                <span>October 3</span>
                <strong>$50 Back the Blue</strong>
              </div>
            </div>
          </motion.div>

          <motion.aside
            className={`booking-access-card ${
              user ? "booking-access-card--signed-in" : ""
            }`}
            aria-label={user ? "Signed-in booking access" : "Sign in to book"}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.75,
              delay: reduceMotion ? 0 : 0.12,
              ease: EASE,
            }}
          >
            {user ? (
              <>
                <div className="booking-access-card__status">
                  <CheckCircle2 aria-hidden="true" />
                  Signed in securely
                </div>
                <p className="booking-card-kicker">Welcome back</p>
                <h2>{firstName}, your hunt starts below.</h2>
                <p>
                  Live availability, party details, and checkout are ready when
                  you are.
                </p>
                <a className="booking-access-card__link" href="#booking-workspace">
                  {showFreshBooking ? "Start your booking" : "Review your cart"}
                  <ArrowDown aria-hidden="true" />
                </a>
                <div className="booking-access-card__account">
                  <ShieldCheck aria-hidden="true" />
                  <span>{user.email}</span>
                </div>
              </>
            ) : (
              <>
                <div className="booking-access-card__icon">
                  <LogIn aria-hidden="true" />
                </div>
                <p className="booking-card-kicker">Account required</p>
                <h2>Sign in to see live availability.</h2>
                <p>
                  Use your account to select hunt dates, add the Party Deck,
                  and keep your reservation details together.
                </p>
                <div className="booking-access-card__actions">
                  <button
                    type="button"
                    className="booking-button booking-button--gold"
                    onClick={() => setAuthOpen(true)}
                  >
                    Sign in or create account
                    <ArrowRight aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="booking-button booking-button--light"
                    onClick={async () => {
                      try {
                        await loginWithGoogle();
                      } catch (error) {
                        console.warn(error);
                      }
                    }}
                  >
                    Continue with Google
                  </button>
                </div>
                <div className="booking-access-card__account">
                  <ShieldCheck aria-hidden="true" />
                  <span>Availability updates in real time.</span>
                </div>
              </>
            )}
          </motion.aside>
        </div>
      </section>

      <section className="booking-page__content">
        <div className="booking-shell">
          {user && (
            <section
              id="booking-workspace"
              className="booking-workspace"
              aria-labelledby="booking-workspace-title"
            >
              <motion.header
                className="booking-section-heading"
                initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: reduceMotion ? 0 : 0.65, ease: EASE }}
              >
                <div>
                  <h2 id="booking-workspace-title">
                    {showFreshBooking
                      ? "Book your hunt."
                      : "Finish booking your hunt."}
                  </h2>
                </div>
                <p>
                  {showFreshBooking
                    ? "Start with your party size, then choose the dates that work for you."
                    : "Your dates are saved. Make any changes you need, or continue to checkout when you're ready."}
                </p>
              </motion.header>

              {showFreshBooking && (
                <ol className="booking-steps" aria-label="Booking steps">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>Party details</strong>
                      <small>Phone and hunter count</small>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Choose dates</strong>
                      <small>Live season availability</small>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>Review & checkout</strong>
                      <small>Confirm before payment</small>
                    </div>
                  </li>
                </ol>
              )}

              <AnimatePresence mode="wait">
                {showFreshBooking ? (
                  <motion.div
                    key="booking-form"
                    className="booking-page__form-shell"
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    transition={{ duration: reduceMotion ? 0 : 0.4, ease: EASE }}
                  >
                    <BookingForm />
                  </motion.div>
                ) : (
                  <motion.div
                    key="cart-blocker"
                    className="booking-progress-card"
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    transition={{ duration: reduceMotion ? 0 : 0.4, ease: EASE }}
                  >
                    <div className="booking-progress-card__header">
                      <p className="booking-card-kicker">Cart in progress</p>
                      <h3>Pick up where you left off.</h3>
                      <p>
                        Your booking and merchandise stay together until you
                        check out or clear the cart.
                      </p>
                    </div>

                    <div className="booking-progress-card__summary">
                      {hasBooking && (
                        <section className="booking-summary-card">
                          <div className="booking-summary-card__title">
                            <CalendarDays aria-hidden="true" />
                            <div>
                              <span>Current hunt</span>
                              <strong>
                                {booking?.numberOfHunters ?? 1} hunter
                                {(booking?.numberOfHunters ?? 1) > 1 ? "s" : ""}
                              </strong>
                            </div>
                          </div>
                          <div className="booking-summary-card__pills">
                            {booking?.dates?.map((date: string) => (
                              <span key={date}>{formatLongDate(date)}</span>
                            ))}
                          </div>
                          {booking?.partyDeckDates?.length ? (
                            <p>
                              Party Deck: {booking.partyDeckDates
                                .map((date: string) => formatLongDate(date))
                                .join(", ")}
                            </p>
                          ) : null}
                        </section>
                      )}

                      {hasMerch && (
                        <section className="booking-summary-card">
                          <div className="booking-summary-card__title">
                            <ShoppingBag aria-hidden="true" />
                            <div>
                              <span>Merchandise</span>
                              <strong>
                                {Object.values(merchItems || {}).length} item
                                {Object.values(merchItems || {}).length === 1
                                  ? ""
                                  : "s"}
                              </strong>
                            </div>
                          </div>
                          <p>Your ranch merchandise is saved in this cart.</p>
                        </section>
                      )}
                    </div>

                    <div className="booking-progress-card__actions">
                      <button
                        type="button"
                        className="booking-button booking-button--gold"
                        onClick={() => navigate("/checkout")}
                      >
                        Continue to checkout
                        <ArrowRight aria-hidden="true" />
                      </button>
                      {hasBooking && (
                        <button
                          type="button"
                          className="booking-button booking-button--outline"
                          onClick={() => setEditOpen(true)}
                        >
                          Edit dates
                        </button>
                      )}
                      <button
                        type="button"
                        className="booking-button booking-button--quiet"
                        onClick={resetCart}
                        title="Clear everything and start over"
                      >
                        Clear cart & start over
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          )}

          <PackagesBrochure />
        </div>
      </section>

      {!user && (
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      )}

      {user && hasBooking && (
        <EditBookingDatesModal
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </main>
  );
};

export default BookingPage;
