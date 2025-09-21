import { motion } from "framer-motion";
import logo from "../assets/logo-official.webp";

const ease = [0.16, 1, 0.3, 1] as const;

const RuleCard = ({
  letter,
  title,
  children,
  delay = 0,
}: {
  letter: string;
  title: string;
  children: React.ReactNode;
  delay?: number;
}) => (
  <motion.div
    className="rounded-2xl border border-white/10 bg-white/5 p-5"
    initial={{ opacity: 0, y: 12 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.3 }}
    transition={{ duration: 0.5, ease, delay }}
    data-aos="fade-up"
  >
    <div className="flex items-start gap-4">
      <div className="shrink-0 w-12 h-12 rounded-xl bg-[var(--color-accent-gold)]/20 border border-[var(--color-accent-gold)]/40 grid place-items-center">
        <span className="text-2xl font-gin text-[var(--color-accent-gold)]">
          {letter}
        </span>
      </div>
      <div>
        <h3 className="text-lg md:text-xl font-gin text-white mb-1">{title}</h3>
        <div className="text-sm md:text-base text-neutral-200/90 font-acumin leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  </motion.div>
);

export default function PropertyRules() {
  return (
    <section className="w-full px-4 md:px-8 py-12 mt-30">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <motion.div
          className="rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-[var(--color-footer)] to-[var(--color-card)]"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease }}
        >
          <div className="py-8 text-center px-4">
            <h1 className="text-3xl md:text-5xl font-gin text-white tracking-wide mb-3">
              Hunting Rules
            </h1>
            <img
              className="h-16 md:h-20 mx-auto mb-4 select-none"
              src={logo}
              alt="Rancho de Paloma Blanca"
              draggable={false}
            />
            <p className="text-xl md:text-2xl font-gin text-[var(--color-accent-gold)]">
              1419 Ranch, LLC
            </p>
          </div>
        </motion.div>

        {/* C.R.I.M.E. cards — matches Party Deck card style */}
        <div className="grid grid-cols-1  gap-4 md:gap-5 mt-6">
          <RuleCard letter="C" title="Clean up your area" delay={0.05}>
            Please pick up all trash, used shells, and gear. Help us keep the
            land clean and ready for the next hunt.
          </RuleCard>

          <RuleCard letter="R" title="Respect fellow hunters" delay={0.1}>
            Be courteous and professional toward everyone on the property. Your
            behavior reflects on all of us.
          </RuleCard>

          <RuleCard
            letter="I"
            title="Intoxicated hunters will not be tolerated"
            delay={0.15}
          >
            Responsible alcohol consumption is allowed, but any reckless or
            unsafe behavior — including handling firearms while visibly impaired
            — will result in immediate removal from the property.
          </RuleCard>

          <RuleCard
            letter="M"
            title="Maintain safe distance between areas"
            delay={0.2}
          >
            Stay aware of your surroundings and avoid hunting too close to other
            groups. Keep a courteous, safe buffer.
          </RuleCard>

          <RuleCard letter="E" title="Elevate your shots" delay={0.25}>
            Never shoot low over the fields. Always elevate your aim to avoid
            endangering others.
          </RuleCard>
        </div>

        {/* Footer note */}
        <motion.p
          className="text-center text-sm md:text-base mt-10 font-acumin text-white/80 bg-[var(--color-dark)]/60 border border-white/5 rounded-2xl py-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease, delay: 0.1 }}
        >
          Thank you for helping us keep the ranch safe, respectful, and fun for
          everyone.
        </motion.p>
      </div>
    </section>
  );
}
