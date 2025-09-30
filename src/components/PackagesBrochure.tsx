// --- PackagesBrochure (brochure-only; no selection or state) ---
import { motion } from "framer-motion";

export function PackagesBrochure() {
  const items = [
    {
      key: "off",
      title: "Regular Season",
      price: "$125",
      unit: "/day per person",
      details: "Available year-round, outside Sept 14th – Oct 26th.",
    },
  ];

  const addon = {
    key: "deck",
    title: "Party Deck",
    price: "$500",
    unit: "/day",
    details: "Optional add-on. Reserve the elevated deck per day if available.",
    badge: "Add-On",
  };

  return (
    <section className="relative max-w-6xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-gin text-white">
          Packages &amp; Pricing
        </h2>
        <p className="mt-2 text-sm md:text-base text-neutral-200">
          Pricing is applied automatically when you pick dates. In-season
          bundles (2-day consecutive, 3-day Fri–Sun) are recognized and
          calculated by our booking logic
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((pkg) => (
          <motion.div
            key={pkg.key}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35 }}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/95 backdrop-blur shadow-md hover:shadow-lg"
          >
            {/* glow on hover */}
            <div
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(220px 160px at 75% -10%, rgba(179,142,53,0.14), transparent)",
              }}
            />
            <div className="relative p-6">
              <h3 className="text-xl font-acumin text-[var(--color-background)]">
                {pkg.title}
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <div className="text-3xl font-bold text-[var(--color-background)]">
                  {pkg.price}
                </div>
                <div className="text-sm text-[var(--color-background)]/70">
                  {pkg.unit}
                </div>
              </div>
              <p className="mt-2 text-sm text-[var(--color-background)]/80">
                {pkg.details}
              </p>
            </div>
          </motion.div>
        ))}

        {/* Add-on card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.35 }}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/95 backdrop-blur shadow-md hover:shadow-lg"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(220px 160px at 75% -10%, rgba(179,142,53,0.14), transparent)",
            }}
          />
          <div className="relative p-6">
            <div className="flex items-start justify-between">
              <h3 className="text-xl font-acumin text-[var(--color-background)]">
                {addon.title}
              </h3>
              <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-[var(--color-footer)] text-white">
                {addon.badge}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <div className="text-3xl font-bold text-[var(--color-background)]">
                {addon.price}
              </div>
              <div className="text-sm text-[var(--color-background)]/70">
                {addon.unit}
              </div>
            </div>
            <p className="mt-2 text-sm text-[var(--color-background)]/80">
              {addon.details}
            </p>
          </div>
        </motion.div>
      </div>

      <div className="mt-6 grid md:grid-cols-3 gap-4 text-sm">
        <div className="rounded-xl border border-black/5 bg-white p-4">
          <p className="font-semibold text-[var(--color-footer)] mb-1">
            In-Season Window
          </p>
          <p className="text-[var(--color-background)]/80">
            Sept 6 – Oct 26 Regular season bookings. all other dates are at{" "}
            <span className="font-medium">$125/day per person</span>.
          </p>
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-4">
          <p className="font-semibold text-[var(--color-footer)] mb-1">
            Capacity
          </p>
          <p className="text-[var(--color-background)]/80">
            We host up to{" "}
            <span className="font-medium">100 hunters per day!</span>&nbsp;
            Availability updates in real-time; spots are confirmed after
            payment.
          </p>
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-4">
          <p className="font-semibold text-[var(--color-footer)] mb-1">
            How pricing applies
          </p>
          <p className="text-[var(--color-background)]/80">
            Select any dates freely; we detect eligible 2-day consecutive and
            Fri–Sun 3-day groupings and apply package pricing automatically at
            checkout.
          </p>
        </div>
      </div>
    </section>
  );
}
