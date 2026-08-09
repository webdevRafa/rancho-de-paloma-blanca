import { useEffect, useMemo, useState } from "react";
import type { PricingWindow, SeasonConfig } from "../types/Types";
import { getSeasonConfig } from "../utils/getSeasonConfig";
import { BACK_THE_BLUE_DATE } from "../utils/huntPricing";

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
    unit: special ? "per hunter" : "per hunter, per hunt day",
    details: special
      ? "Special first-responder event. Proof of eligibility is required at check-in."
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
        unit: "per hunter, per hunt day",
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
      unit: "per hunter, per hunt day",
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
    <section className="relative max-w-6xl mx-auto px-1 py-2 lg:px-0">
      <div className="mb-8">
        <h2 className="text-3xl md:text-5xl font-gin text-white leading-tight">
          {seasonYear} Dove Hunting Season
        </h2>

        {seasonConfig && (
          <p className="mt-2 text-base md:text-lg text-black font-bold bg-[var(--color-accent-gold)] max-w-fit px-2">
            {formatSeasonRange(
              seasonConfig.seasonStart,
              seasonConfig.seasonEnd
            )}
          </p>
        )}

        <p className="mt-4 max-w-2xl text-sm md:text-[15px] leading-7 text-neutral-200/90">
          Choose any available hunt date. Current rates are loaded directly from
          the active season configuration used at checkout.
        </p>
      </div>

      {!seasonConfig && !loadError && (
        <div className="rounded-2xl border border-white/10 bg-white/95 p-6 text-[var(--color-background)]">
          Loading current hunt rates…
        </div>
      )}

      {loadError && (
        <div className="rounded-2xl border border-red-300 bg-white/95 p-6 text-red-900">
          Current pricing is temporarily unavailable. Please refresh before
          booking.
        </div>
      )}

      {seasonConfig && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {rateCards.map((card) => (
            <div
              key={card.key}
              className={`group relative overflow-hidden rounded-2xl border bg-white/95 backdrop-blur shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${
                card.special
                  ? "border-blue-400 ring-1 ring-blue-300"
                  : "border-white/10"
              }`}
            >
              <div className="relative p-6 flex flex-col h-full">
                {card.badge && (
                  <div
                    className={`mb-3 inline-flex rounded-full px-2.5 py-1 text-[14px] font-semibold uppercase tracking-wide text-white ${
                      card.special ? "bg-blue-800" : "bg-[var(--color-footer)]"
                    }`}
                  >
                    {card.badge}
                  </div>
                )}

                <h3 className="text-xl font-acumin text-[var(--color-background)]">
                  {card.title}
                </h3>

                {card.tiers?.length ? (
                  <div className="mt-4 rounded-xl border border-black/8 bg-[var(--color-background)]/5 p-4">
                    <div className="space-y-2">
                      {card.tiers.map((tier) => (
                        <div
                          key={tier.label}
                          className="flex items-center justify-between gap-3 border-b border-black/8 pb-2 last:border-b-0 last:pb-0"
                        >
                          <span className="text-sm font-medium text-[var(--color-background)]/80">
                            {tier.label}
                          </span>
                          <span className="text-lg font-bold tracking-tight text-[var(--color-background)]">
                            {tier.price}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[var(--color-background)]/55">
                      {card.unit}
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-baseline gap-1">
                    <div className="text-2xl font-bold tracking-tight">
                      {card.price}
                    </div>
                    <div className="text-sm text-[var(--color-background)]/70">
                      {card.unit}
                    </div>
                  </div>
                )}

                <p className="mt-3 text-sm leading-6 text-[var(--color-background)]/80">
                  {card.details}
                </p>
              </div>
            </div>
          ))}

          <div className="group relative overflow-hidden border-[var(--color-accent-gold)] border-2 backdrop-blur shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
            <div className="relative p-6">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="text-xl font-acumin text-white">Party Deck</h3>
                <span className="rounded-full px-2 py-1 text-[10px] uppercase tracking-wide text-white">
                  Add-on
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-baseline gap-1">
                <div className="text-3xl font-bold text-white">
                  {formatCurrency(partyDeckRate)}
                </div>
                <div className="text-sm text-white">per hunt, per day</div>
              </div>

              <p className="mt-3 text-sm leading-6 text-white">
                Elevate your hunt with our two-story Party Deck overlooking the
                fields, with shade, power, fans, and running water on site.
              </p>
            </div>
          </div>
        </div>
      )}

      {seasonConfig && (
        <div className="mt-6 grid md:grid-cols-2 gap-4 text-sm">
          <div className="p-4">
            <p className="mb-1 font-semibold text-white">Season Window</p>
            <p className="text-white">
              The current season runs from {formatSeasonRange(
                seasonConfig.seasonStart,
                seasonConfig.seasonEnd
              )}.
            </p>
          </div>

          <div className="p-4">
            <p className="mb-1 font-semibold text-white">Capacity</p>
            <p className="text-white">
              We host up to {seasonConfig.maxHuntersPerDay} hunters per day.
              Availability updates in real time, and spots are confirmed after
              payment.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
