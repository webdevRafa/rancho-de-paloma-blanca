import { motion } from "framer-motion";
import logo from "../assets/logo-official.webp";

const ease = [0.16, 1, 0.3, 1] as const;

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.35 },
  transition: { duration: 0.5, ease, delay },
});

const cardFade = (delay = 0) => ({
  initial: { opacity: 0, y: 10 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.45, ease, delay },
});

export default function AboutPage() {
  return (
    <section className="min-h-screen pt-24 pb-20 px-6 text-[var(--color-text)]">
      <div className="mx-auto max-w-6xl">
        {/* HERO */}
        <motion.div
          className="rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-[var(--color-footer)] to-[var(--color-card)]"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease }}
        >
          <div className="px-6 py-10 text-center">
            <motion.h1
              className="text-3xl md:text-5xl font-gin text-white tracking-wide mb-3"
              {...fadeUp(0.05)}
            >
              About Us
            </motion.h1>
            <motion.img
              src={logo}
              alt="Rancho de Paloma Blanca"
              className="h-20 md:h-24 mx-auto mb-4 select-none"
              draggable={false}
              data-aos="zoom-in-up"
              data-aos-delay="120"
              {...fadeUp(0.12)}
            />
            <motion.p
              className="text-base md:text-lg text-neutral-200/90 max-w-3xl mx-auto font-acumin"
              {...fadeUp(0.16)}
            >
              Rancho de Paloma Blanca is a premier dove hunting operation
              proudly run under the 1419 Ranch in Brownsville, Texas. Managed by
              Steve Clark and Ray Loop, this family-owned and operated ranch has
              been rooted in the region for over 100 years. With more than 30
              years of experience in the dove hunting industry, we’re committed
              to a time-honored, authentic South Texas hunting experience.
            </motion.p>
          </div>
        </motion.div>

        {/* HIGHLIGHTS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mt-6">
          <motion.div
            className="rounded-2xl border border-white/10 bg-white/5 p-5"
            {...cardFade(0.05)}
            data-aos="fade-up"
          >
            <h3 className="font-gin text-white text-xl mb-1">Where We Hunt</h3>
            <p className="text-sm md:text-base text-neutral-200/90 font-acumin">
              Brownsville, Texas — part of a storied South Texas migration path
              and home to our expansive fields and amenities.
            </p>
          </motion.div>

          <motion.div
            className="rounded-2xl border border-white/10 bg-white/5 p-5"
            {...cardFade(0.1)}
            data-aos="fade-up"
            data-aos-delay="50"
          >
            <h3 className="font-gin text-white text-xl mb-1">Heritage</h3>
            <p className="text-sm md:text-base text-neutral-200/90 font-acumin">
              Family-owned & operated; the ranch has been rooted in the region{" "}
              <span className="font-semibold">for over 100 years</span>.
            </p>
          </motion.div>

          <motion.div
            className="rounded-2xl border border-white/10 bg-white/5 p-5"
            {...cardFade(0.15)}
            data-aos="fade-up"
            data-aos-delay="100"
          >
            <h3 className="font-gin text-white text-xl mb-1">Experience</h3>
            <p className="text-sm md:text-base text-neutral-200/90 font-acumin">
              Over <span className="font-semibold">30 years</span> in the dove
              hunting industry — delivering safe, authentic South Texas hunts.
            </p>
          </motion.div>
        </div>

        {/* STORY SECTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 mt-6">
          <motion.div
            className="rounded-2xl border border-white/10 bg-white/5 p-5"
            {...cardFade(0.2)}
            data-aos="fade-up"
          >
            <h3 className="font-gin text-white text-2xl mb-2">Our Story</h3>
            <p className="text-neutral-200/90 font-acumin leading-relaxed">
              We’re built on South Texas tradition — steady habitat management,
              respectful field etiquette, and a focus on the full hunt day:
              sunrise to the last flight and the cookout after.
            </p>
          </motion.div>

          <motion.div
            className="rounded-2xl border border-white/10 bg-white/5 p-5"
            {...cardFade(0.25)}
            data-aos="fade-up"
            data-aos-delay="50"
          >
            <h3 className="font-gin text-white text-2xl mb-2">
              Our Commitment
            </h3>
            <p className="text-neutral-200/90 font-acumin leading-relaxed">
              Honest hospitality, clean and safe fields, and thoughtful
              amenities — from shaded breaks to an organized end-of-day grill.
            </p>
          </motion.div>
        </div>

        {/* CTA */}
        <motion.div
          className="text-center mt-10"
          {...fadeUp(0.35)}
          data-aos="fade-up"
          data-aos-delay="120"
        ></motion.div>
      </div>
    </section>
  );
}
