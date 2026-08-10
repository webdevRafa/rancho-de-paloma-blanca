import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  MapPin,
  ShieldCheck,
  Sparkles,
  Sunrise,
  UsersRound,
} from "lucide-react";
import type { SeasonConfig } from "../types/Types";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import palomas from "../assets/images/palomas.webp";
import huntHero from "../assets/images/hunthero.webp";
import hunterPortrait from "../assets/images/IMG_5547.webp";
import hunterWalk from "../assets/images/IMG_5574.webp";
import groupPhoto from "../assets/images/group.webp";
import birdsInFlight from "../assets/images/bird-bunch.webp";
import partyDeck from "../assets/images/four.webp";
import "./HomePage.css";

const EASE = [0.16, 1, 0.3, 1] as const;

const parseLocalDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatSeasonRange = (start?: string, end?: string) => {
  if (!start || !end) return "September 1 — October 25, 2026";

  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  const startMonth = startDate.toLocaleString("en-US", { month: "long" });
  const endMonth = endDate.toLocaleString("en-US", { month: "long" });

  return `${startMonth} ${startDate.getDate()} — ${endMonth} ${endDate.getDate()}, ${endDate.getFullYear()}`;
};

const getStandardRate = (config: SeasonConfig | null) =>
  config?.pricingWindows?.find(
    (window) =>
      !window.requiresDisclaimer &&
      window.type === "flat" &&
      typeof window.rate === "number"
  )?.rate ??
  config?.weekdayRate ??
  150;

const getEventRate = (config: SeasonConfig | null) =>
  config?.pricingWindows?.find(
    (window) =>
      window.requiresDisclaimer ||
      window.label?.toLowerCase().includes("back the blue")
  )?.rate ?? 50;

const HomePage = () => {
  const reduceMotion = useReducedMotion();
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);

  useEffect(() => {
    let active = true;

    getSeasonConfig()
      .then((config) => {
        if (active) setSeasonConfig(config);
      })
      .catch(() => {
        // The homepage keeps accurate published fallbacks if Firestore is unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  const season = useMemo(
    () => ({
      year: seasonConfig?.seasonStart?.slice(0, 4) ?? "2026",
      range: formatSeasonRange(
        seasonConfig?.seasonStart,
        seasonConfig?.seasonEnd
      ),
      standardRate: getStandardRate(seasonConfig),
      eventRate: getEventRate(seasonConfig),
      partyDeckRate: seasonConfig?.partyDeckRatePerDay ?? 500,
    }),
    [seasonConfig]
  );

  const reveal = {
    initial: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: reduceMotion ? 0 : 0.75, ease: EASE },
  };

  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <img
          className="home-hero__media"
          src={palomas}
          alt="A flight of doves crossing the fields at Rancho de Paloma Blanca"
          fetchPriority="high"
        />
        <div className="home-hero__wash" aria-hidden="true" />
        <div className="home-hero__grain" aria-hidden="true" />

        <div className="home-shell home-hero__inner">
          <motion.div
            className="home-hero__copy"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.9, ease: EASE }}
          >
            <p className="home-eyebrow">
              <MapPin aria-hidden="true" />
              Brownsville, Texas
            </p>
            <h1 id="home-hero-title">
              Where South Texas{" "}
              <span>takes flight.</span>
            </h1>
            <p className="home-hero__lede">
              Authentic dove hunting, wide-open fields, and a century of ranch
              tradition—built for the people you want beside you when the sky
              comes alive.
            </p>

            <div className="home-actions">
              <Link className="home-button home-button--primary" to="/book">
                Book your hunt
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="home-button home-button--ghost" to="/gallery">
                See the ranch
              </Link>
            </div>
          </motion.div>

          <motion.aside
            className="home-hero__season"
            aria-label={`${season.year} dove hunting season details`}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.9,
              delay: reduceMotion ? 0 : 0.18,
              ease: EASE,
            }}
          >
            <div className="home-hero__season-topline">
              <span>{season.year} season</span>
              <span>Now booking</span>
            </div>
            <p className="home-hero__price">
              <sup>$</sup>
              {season.standardRate}
            </p>
            <p className="home-hero__unit">per hunter, per hunt day</p>
            <div className="home-hero__season-rule" />
            <p className="home-hero__date">{season.range}</p>
            <Link to="/book" className="home-hero__availability">
              View available dates
              <ArrowRight aria-hidden="true" />
            </Link>
          </motion.aside>
        </div>

        <a className="home-hero__scroll" href="#our-story">
          <span>Discover the ranch</span>
          <ArrowDown aria-hidden="true" />
        </a>
      </section>

      <div className="home-rail" aria-label="Rancho highlights">
        <div className="home-rail__track">
          <span>White-wing dove country</span>
          <i aria-hidden="true" />
          <span>Brownsville, Texas</span>
          <i aria-hidden="true" />
          <span>Family owned</span>
          <i aria-hidden="true" />
          <span>Rooted at 1419 Ranch</span>
        </div>
      </div>

      <section id="our-story" className="home-story home-section">
        <div className="home-shell home-story__grid">
          <motion.div className="home-story__copy" {...reveal}>
            <p className="home-kicker">Rooted here</p>
            <h2>A century on the land. Thirty years in the field.</h2>
            <p className="home-story__lead">
              Rancho de Paloma Blanca is a family-run dove hunting operation
              under the historic 1419 Ranch—where South Texas hospitality is
              every bit as important as the hunt.
            </p>
            <p>
              We keep the experience straightforward: thoughtfully managed
              fields, clear booking, room for your whole group, and the kind of
              welcome that turns a morning in Brownsville into a tradition of
              your own.
            </p>
            <Link className="home-text-link" to="/about">
              Our story
              <ArrowRight aria-hidden="true" />
            </Link>

            <div className="home-story__figures" aria-label="Ranch experience">
              <div>
                <strong>100+</strong>
                <span>years rooted in the region</span>
              </div>
              <div>
                <strong>30+</strong>
                <span>years in dove hunting</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="home-story__visual"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: reduceMotion ? 0 : 0.9, ease: EASE }}
          >
            <img
              className="home-story__main-image"
              src={huntHero}
              alt="A dove hunter walking through the South Texas sunflower field"
              loading="lazy"
            />
            <figure className="home-story__portrait">
              <img
                src={hunterPortrait}
                alt="Hunters enjoying a day at Rancho de Paloma Blanca"
                loading="lazy"
              />
              <figcaption>Good fields. Good people. A day worth remembering.</figcaption>
            </figure>
            <div className="home-story__stamp" aria-hidden="true">
              <span>Est.</span>
              <strong>1419</strong>
              <span>Ranch</span>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="home-experience home-section" aria-labelledby="experience-title">
        <div className="home-shell">
          <motion.header className="home-section-heading" {...reveal}>
            <div>
              <p className="home-kicker">The experience</p>
              <h2 id="experience-title">Come for the flight. Stay for the story.</h2>
            </div>
            <p>
              Every part of the day is designed to feel easy, authentic, and
              distinctly South Texas—from the first light to the last laugh.
            </p>
          </motion.header>

          <div className="home-bento">
            <motion.article className="home-bento__card home-bento__card--flight" {...reveal}>
              <img
                src={birdsInFlight}
                alt="A large flight of doves over the ranch"
                loading="lazy"
              />
              <div className="home-bento__shade" />
              <div className="home-bento__content">
                <span>01 / The flight</span>
                <h3>South Texas skies in motion.</h3>
                <p>Expansive fields along a storied migration path.</p>
              </div>
            </motion.article>

            <motion.article className="home-bento__card home-bento__card--people" {...reveal}>
              <img
                src={groupPhoto}
                alt="A group of friends after a dove hunt at the ranch"
                loading="lazy"
              />
              <div className="home-bento__shade" />
              <div className="home-bento__content">
                <span>02 / Your people</span>
                <h3>Better shared.</h3>
                <p>Bring the crew. Leave with another story.</p>
              </div>
            </motion.article>

            <motion.article className="home-bento__card home-bento__card--details" {...reveal}>
              <div className="home-bento__number">03</div>
              <p className="home-kicker">A smooth day in the field</p>
              <h3>The details are handled.</h3>
              <ul>
                <li>
                  <Sunrise aria-hidden="true" />
                  Thoughtfully managed South Texas fields
                </li>
                <li>
                  <UsersRound aria-hidden="true" />
                  Space for friends, families, and larger groups
                </li>
                <li>
                  <ShieldCheck aria-hidden="true" />
                  Clear rules and simple online booking
                </li>
              </ul>
              <Link className="home-text-link" to="/rules">
                Know before you go
                <ArrowRight aria-hidden="true" />
              </Link>
            </motion.article>

            <motion.article className="home-bento__card home-bento__card--walk" {...reveal}>
              <img
                src={hunterWalk}
                alt="A hunter walking back from the field at Rancho de Paloma Blanca"
                loading="lazy"
              />
              <div className="home-bento__shade" />
              <div className="home-bento__content">
                <span>04 / The tradition</span>
                <h3>Unhurried. Uncomplicated. Unforgettable.</h3>
              </div>
            </motion.article>
          </div>
        </div>
      </section>

      <section className="home-season home-section" aria-labelledby="season-title">
        <div className="home-season__glow" aria-hidden="true" />
        <div className="home-shell home-season__grid">
          <motion.div className="home-season__intro" {...reveal}>
            <p className="home-kicker">{season.year} dove season</p>
            <h2 id="season-title">One rate. Any available hunt day.</h2>
            <p>
              Straightforward pricing lets you spend less time comparing
              packages and more time planning who is coming with you.
            </p>
            <div className="home-season__date">
              <CalendarDays aria-hidden="true" />
              <span>{season.range}</span>
            </div>
          </motion.div>

          <motion.div className="home-season__rate" {...reveal}>
            <p>Standard hunt</p>
            <div>
              <sup>$</sup>
              <strong>{season.standardRate}</strong>
            </div>
            <span>per hunter, per hunt day</span>
            <Link className="home-button home-button--primary" to="/book">
              Check availability
              <ArrowRight aria-hidden="true" />
            </Link>
          </motion.div>

          <motion.aside className="home-season__event" {...reveal}>
            <div className="home-season__event-icon">
              <Sparkles aria-hidden="true" />
            </div>
            <p className="home-season__event-date">October 3, {season.year}</p>
            <h3>Back the Blue Dove Hunt</h3>
            <p>
              A special hunt honoring first responders. When a first responder
              books, everyone in their party receives the event rate.
            </p>
            <div className="home-season__event-rate">
              <strong>${season.eventRate}</strong>
              <span>per hunter, per day</span>
            </div>
            <Link to="/book" className="home-season__event-link">
              Reserve the event
              <ArrowRight aria-hidden="true" />
            </Link>
          </motion.aside>
        </div>
      </section>

      <section className="home-deck home-section" aria-labelledby="deck-title">
        <div className="home-shell home-deck__frame">
          <motion.div className="home-deck__image-wrap" {...reveal}>
            <img
              src={partyDeck}
              alt="The illuminated two-story Party Deck at Rancho de Paloma Blanca"
              loading="lazy"
            />
            <div className="home-deck__image-label">Overlooking the fields</div>
          </motion.div>

          <motion.div className="home-deck__copy" {...reveal}>
            <p className="home-kicker">Make a day of it</p>
            <h2 id="deck-title">Your place between flights.</h2>
            <p>
              Our two-story Party Deck gives your group a comfortable home base
              with shade, power, fans, running water, and a full-size grill.
              Regroup, cook, and take in the ranch from above.
            </p>
            <div className="home-deck__amenities" aria-label="Party Deck amenities">
              <span>Two stories</span>
              <span>Full-size grill</span>
              <span>Power & fans</span>
              <span>Running water</span>
            </div>
            <div className="home-deck__footer">
              <p>
                <strong>${season.partyDeckRate}</strong>
                <span>per hunt, per day</span>
              </p>
              <Link className="home-text-link" to="/book">
                Add it to your hunt
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="home-final" aria-labelledby="final-title">
        <img
          src={hunterPortrait}
          alt="Two hunters in a South Texas field at Rancho de Paloma Blanca"
          loading="lazy"
        />
        <div className="home-final__wash" aria-hidden="true" />
        <motion.div className="home-shell home-final__content" {...reveal}>
          <p className="home-kicker">The sky is waiting</p>
          <h2 id="final-title">Make this season one you remember.</h2>
          <p>
            Pick your date, bring your people, and meet us in Brownsville.
          </p>
          <div className="home-actions home-actions--centered">
            <Link className="home-button home-button--primary" to="/book">
              Book your hunt
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="home-button home-button--ghost" to="/contact">
              Talk to the ranch
            </Link>
          </div>
        </motion.div>
      </section>
    </main>
  );
};

export default HomePage;
