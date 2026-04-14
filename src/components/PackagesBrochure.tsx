type PackageTier = {
  label: string;
  price: string;
};

type PackageCard = {
  key: string;
  title: string;
  price?: string;
  unit?: string;
  details: string;
  badge?: string;
  tiers?: PackageTier[];
};
export function PackagesBrochure() {
  const packages: PackageCard[] = [
    {
      key: "rio-hondo",
      title: "Opening Hunts • Rio Hondo",
      price: "$200",
      unit: "per gun",
      details:
        "Tuesday, Sept 1 – Thursday, Sept 3. Opening hunts in Rio Hondo, TX.",
      badge: "Sept 1–3",
    },
    {
      key: "weekend-package-1",
      title: "Weekend Package Rates",
      unit: "per gun",
      details:
        "Friday, Sept 4 – Sunday, Sept 6. Weekend package pricing applies to consecutive hunt days.",
      badge: "Sept 4–6",
      tiers: [
        { label: "1 day", price: "$200" },
        { label: "2 consecutive days", price: "$350" },
        { label: "3 consecutive days", price: "$450" },
      ],
    },
    {
      key: "standard-early",
      title: "Standard Hunts",
      price: "$200",
      unit: "per gun",
      details:
        "Monday, Sept 7 – Thursday, Sept 10. Standard in-season hunt rate.",
      badge: "Sept 7–10",
    },
    {
      key: "weekend-package-2",
      title: "Weekend Package Rates",
      unit: "per gun",
      details:
        "Friday, Sept 11 – Sunday, Sept 13. Weekend package pricing applies to consecutive hunt days.",
      badge: "Sept 11–13",
      tiers: [
        { label: "1 day", price: "$200" },
        { label: "2 consecutive days", price: "$350" },
        { label: "3 consecutive days", price: "$450" },
      ],
    },

    {
      key: "late-season",
      title: "Late Season Hunts",
      price: "$150",
      unit: "per gun",
      details:
        "Monday, Sept 14 – Sunday, Oct 25. Reduced late-season hunt rate.",
      badge: "Sept 14 – Oct 25",
    },
  ];

  const addon = {
    key: "deck",
    title: "Party Deck",
    price: "$500",
    unit: "per hunt, per day",
    details:
      "Elevate your hunt with our two-story Party Deck overlooking the fields. Perfect for regrouping between flights, grilling, and relaxing in comfort with shade, power, fans, and running water on site.",
    badge: "Add-On",
  };

  return (
    <section className="relative max-w-6xl mx-auto px-1 py-2 lg:px-0">
      <div className="mb-8">
        <h2 className="text-3xl md:text-5xl font-gin text-white leading-tight">
          2026 Dove Hunting Season
        </h2>

        <p className="mt-2 text-base md:text-lg text-black font-bold bg-[var(--color-accent-gold)] max-w-[400px] px-2 ">
          September 1 – October 25, 2026
        </p>

        <p className="mt-4 max-w-2xl text-sm md:text-[15px] leading-7 text-neutral-200/90">
          Choose your hunt dates below. Weekend packages are automatically
          applied based on availability.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {packages.map((pkg) => (
          <div
            key={pkg.key}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/95 backdrop-blur shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(220px 160px at 75% -10%, rgba(179,142,53,0.14), transparent)",
              }}
            />
            <div className="relative p-6 flex flex-col h-full">
              {pkg.badge && (
                <div className="mb-3 inline-flex rounded-full bg-[var(--color-footer)] px-2.5 py-1 text-[14px] font-semibold uppercase tracking-wide text-white">
                  {pkg.badge}
                </div>
              )}

              <h3 className="text-xl font-acumin text-[var(--color-background)]">
                {pkg.title}
              </h3>

              {pkg.tiers?.length ? (
                <div className="mt-4 rounded-xl border border-black/8 bg-[var(--color-background)]/5 p-4">
                  <div className="space-y-2">
                    {pkg.tiers.map((tier) => (
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

                  {pkg.unit && (
                    <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[var(--color-background)]/55">
                      {pkg.unit}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-baseline gap-1">
                  <div className="text-2xl font-bold tracking-tight">
                    {pkg.price}
                  </div>
                  {pkg.unit && (
                    <div className="text-sm text-[var(--color-background)]/70">
                      {pkg.unit}
                    </div>
                  )}
                </div>
              )}

              <p className="mt-3 text-sm leading-6 text-[var(--color-background)]/80">
                {pkg.details}
              </p>
            </div>
          </div>
        ))}

        <div className="group relative overflow-hidden border-[var(--color-accent-gold)] border-2 backdrop-blur shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(220px 160px at 75% -10%, rgba(179,142,53,0.14), transparent)",
            }}
          />
          <div className="relative p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-xl font-acumin text-white">{addon.title}</h3>
              <span className="rounded-full  px-2 py-1 text-[10px] uppercase tracking-wide text-white">
                {addon.badge}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-baseline gap-1">
              <div className="text-3xl font-bold text-white">{addon.price}</div>
              <div className="text-sm text-white">{addon.unit}</div>
            </div>

            <p className="mt-3 text-sm leading-6 text-white">{addon.details}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid md:grid-cols-3 gap-4 text-sm">
        <div className=" p-4">
          <p className="mb-1 font-semibold text-white">2026 Season Window</p>
          <p className="text-white">
            The current season runs from{" "}
            <span className="font-medium">September 1, 2026</span> through{" "}
            <span className="font-medium">October 25, 2026</span>.
          </p>
        </div>

        <div className=" p-4">
          <p className="mb-1 font-semibold text-white">Capacity</p>
          <p className="text-white">
            We host up to{" "}
            <span className="font-medium">100 hunters per day</span>.
            Availability updates in real time, and spots are confirmed after
            payment.
          </p>
        </div>
      </div>
    </section>
  );
}
