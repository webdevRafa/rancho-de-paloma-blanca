import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { PricingWindow, SeasonConfig } from "../types/Types";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import { BACK_THE_BLUE_DATE } from "../utils/huntPricing";
import partyDeckImage from "../assets/images/four.webp";
import "./PackagesBrochure.css";

type RateTier = {
  label: string;
  price: string;
};

type RateCard = {
  key: string;
  title: string;
  price?: string;
  unit?: string;
  details: string;
  badge?: string;
  tiers?: RateTier[];
  special?: boolean;
};

const formatCurrency = (value?: number) =>
  typeof value === "number" ? `$${value.toLocaleString("en-US")}` : "—";

const parseIsoDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatBadgeRange = (start: string, end: string) => {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  const startMonth = startDate.toLocaleString("en-US", { month: "short" });
  const endMonth = endDate.toLocaleString("en-US", { month: "short" });

  if (start === end) return `${startMonth} ${startDate.getDate()}`;
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startMonth} ${startDate.getDate()}–${endDate.getDate()}`;
  }

  return `${startMonth} ${startDate.getDate()} – ${endMonth} ${endDate.getDate()}`;
};

const formatSeasonRange = (start: string, end: string) => {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  const startMonth = startDate.toLocaleString("en-US", { month: "long" });
  const endMonth = endDate.toLocaleString("en-US", { month: "long" });

  return `${startMonth} ${startDate.getDate()} – ${endMonth} ${endDate.getDate()}, ${endDate.getFullYear()}`;
};

const isSpecialWindow = (window: PricingWindow) =>
  window.requiresDisclaimer === true ||
  (window.start === BACK_THE_BLUE_DATE && window.end === BACK_THE_BLUE_DATE);

const windowToCard = (window: PricingWindow): RateCard => {
  const special = isSpecialWindow(window);
  const dateLabel = formatSeasonRange(window.start, window.end);

  if (window.type === "package") {
    const tiers = [
      { label: "1 day", value: window.singleDay },
      { label: "2 consecutive days", value: window.twoConsecutiveDays },
      { label: "3 consecutive days", value: window.threeDayCombo },
    ]
      .filter((tier) => typeof tier.value === "number")
      .map((tier) => ({
        label: tier.label,
        price: formatCurrency(tier.value),
      }));

    return {
      key: `${window.start}-${window.end}-package`,
      title: window.label || "Consecutive Hunt Rates",
      unit: "per hunter",
      details: `${dateLabel}. Consecutive-day pricing is applied automatically.`,
      badge: formatBadgeRange(window.start, window.end),
      tiers,
    };
  }

  return {
    key: `${window.start}-${window.end}-flat`,
    title: window.label || (special ? "Back the Blue" : "Standard Hunt Rate"),
    price: formatCurrency(window.rate),
    unit: "per hunter, per day",
    details: special
      ? "A special hunt for first responders. Proof of eligibility is required at check-in."
      : `${dateLabel}. The same rate applies to every hunter on each selected date.`,
    badge: formatBadgeRange(window.start, window.end),
    special,
  };
};

const buildRateCards = (config: SeasonConfig): RateCard[] => {
  const windows = config.pricingWindows ?? [];
  const specialWindows = windows.filter(isSpecialWindow);
  const standardWindows = windows.filter((window) => !isSpecialWindow(window));
  const standardRates = new Set(
    standardWindows
      .map((window) => window.rate)
      .filter(
        (rate): rate is number =>
          typeof rate === "number" && Number.isFinite(rate)
      )
  );
  const hasOneFlatStandardRate =
    standardWindows.length > 0 &&
    standardWindows.every((window) => window.type === "flat") &&
    standardRates.size === 1;

  if (hasOneFlatStandardRate) {
    const [standardRate] = [...standardRates] as number[];
    return [
      {
        key: "standard-season-rate",
        title: "2026 Dove Hunting Season",
        price: formatCurrency(standardRate),
        unit: "per hunter, per day",
        details: `${formatSeasonRange(
          config.seasonStart,
          config.seasonEnd
        )}. The same standard rate applies to every available hunt date, except the special event listed separately.`,
        badge: formatBadgeRange(config.seasonStart, config.seasonEnd),
      },
      ...specialWindows.map(windowToCard),
    ];
  }

  if (windows.length > 0) return windows.map(windowToCard);

  return [
    {
      key: "fallback-season-rate",
      title: "Standard Hunt Rate",
      price: formatCurrency(config.weekdayRate),
      unit: "per hunter, per day",
      details: `${formatSeasonRange(
        config.seasonStart,
        config.seasonEnd
      )}. Current availability is shown in the booking calendar.`,
      badge: formatBadgeRange(config.seasonStart, config.seasonEnd),
    },
  ];
};

export function PackagesBrochure() {
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;

    getSeasonConfig()
      .then((config) => {
        if (active) setSeasonConfig(config);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const rateCards = useMemo(
    () => (seasonConfig ? buildRateCards(seasonConfig) : []),
    [seasonConfig]
  );
  const partyDeckRate = seasonConfig?.partyDeckRatePerDay;
  const seasonYear = seasonConfig?.seasonStart?.slice(0, 4) || "2026";

  return (
    <section className="packages-brochure" aria-label={`${seasonYear} season details and rates`}>
      <header className="packages-brochure__header">
        <div>
          <p className="packages-brochure__eyebrow">{seasonYear} season details</p>
        </div>

        <div className="packages-brochure__intro">
          <p>
            Pick any available date and build the day that fits your group. The
            standard rate stays the same throughout the season, with one special
            event priced separately.
          </p>
          {seasonConfig && (
            <p className="packages-brochure__date-chip">
              <CalendarDays aria-hidden="true" size={17} />
              {formatSeasonRange(
                seasonConfig.seasonStart,
                seasonConfig.seasonEnd
              )}
            </p>
          )}
        </div>
      </header>

      {!seasonConfig && !loadError && (
        <div className="packages-brochure__notice" role="status">
          Loading current hunt rates…
        </div>
      )}

      {loadError && (
        <div
          className="packages-brochure__notice packages-brochure__notice--error"
          role="alert"
        >
          Current pricing is temporarily unavailable. Please refresh before
          booking.
        </div>
      )}

      {seasonConfig && (
        <div className="packages-brochure__cards">
          {rateCards.map((card) => (
            <article
              key={card.key}
              className={`packages-card${
                card.special ? " packages-card--special" : ""
              }`}
            >
              <div className="packages-card__topline">
                {card.badge && (
                  <span className="packages-card__badge">{card.badge}</span>
                )}
                <span className="packages-card__category">
                  {card.special ? "First responders" : "Standard hunt"}
                </span>
              </div>

              <div className="packages-card__body">
                <h3>{card.title}</h3>

                {card.tiers?.length ? (
                  <div className="packages-card__tiers">
                    <div>
                      {card.tiers.map((tier) => (
                        <div key={tier.label} className="packages-card__tier">
                          <span>{tier.label}</span>
                          <strong>{tier.price}</strong>
                        </div>
                      ))}
                    </div>
                    <p className="packages-card__unit">{card.unit}</p>
                  </div>
                ) : (
                  <div className="packages-card__rate">
                    <strong>{card.price}</strong>
                    <span>{card.unit}</span>
                  </div>
                )}

                <p className="packages-card__details">{card.details}</p>
              </div>

              <div className="packages-card__footer">
                <ShieldCheck aria-hidden="true" size={18} />
                <span>
                  {card.special
                    ? "Eligibility checked at arrival"
                    : "Rate applied at checkout"}
                </span>
              </div>
            </article>
          ))}

          <article className="packages-card packages-card--deck">
            <img
              src={partyDeckImage}
              alt="The two-story Party Deck overlooking the ranch fields"
            />
            <div className="packages-card--deck__wash" aria-hidden="true" />
            <div className="packages-card--deck__content">
              <div className="packages-card__topline">
                <span className="packages-card__badge">Party Deck</span>
                <span className="packages-card__category">Add-on</span>
              </div>

              <div className="packages-card--deck__body">
                <p className="packages-card--deck__kicker">
                  <Sparkles aria-hidden="true" size={17} />
                  The best seat on the ranch
                </p>
                <h3>Make the Party Deck your home base.</h3>
                <div className="packages-card__rate">
                  <strong>{formatCurrency(partyDeckRate)}</strong>
                  <span>per hunt, per day</span>
                </div>
                <p>
                  A two-story gathering spot with shade, power, fans, running
                  water, and a full-size grill overlooking the fields.
                </p>
              </div>

              <div className="packages-card--deck__availability">
                <span aria-hidden="true" /> First come, first served
              </div>
            </div>
          </article>
        </div>
      )}

      {seasonConfig && (
        <div className="packages-brochure__assurances">
          <div className="packages-assurance">
            <CalendarDays aria-hidden="true" />
            <div>
              <p>Season window</p>
              <span>
                {formatSeasonRange(
                  seasonConfig.seasonStart,
                  seasonConfig.seasonEnd
                )}
              </span>
            </div>
          </div>

          <div className="packages-assurance">
            <UsersRound aria-hidden="true" />
            <div>
              <p>Daily capacity</p>
              <span>Up to {seasonConfig.maxHuntersPerDay} hunters per day</span>
            </div>
          </div>

          <div className="packages-assurance">
            <ShieldCheck aria-hidden="true" />
            <div>
              <p>Party Deck</p>
              <span>First come, first served and confirmed after payment</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
