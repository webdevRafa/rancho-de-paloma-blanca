import logo from "../assets/logo-official.webp";

const PropertyRules = () => {
  return (
    <section
      data-aos="fade-in"
      className="bg-gradient-to-r from-[var(--color-dark)] via-[var(--color-footer)] to-[var(--color-dark)] text-[var(--color-text)] px-6 py-16 max-w-4xl mx-auto my-30 rounded-lg shadow-sm"
    >
      {/* Header */}
      <h1 className="text-4xl font-broadsheet text-[var(--color-accent-gold)] mb-2 text-center">
        Hunting Rules
      </h1>
      <img className="h-30 mx-auto mb" src={logo} alt="" />
      <p className="text-lg font-broadsheet text-[var(--color-accent-sage)] mb-10 text-center">
        1419 Ranch, LLC
      </p>

      {/* C.R.I.M.E. Breakdown */}
      <div className="space-y-8 font-acumin text-[var(--color-text)]">
        <div>
          <h2 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
            C — Clean up your area
          </h2>
          <p className="ml-5 text-neutral-400!">
            Please pick up all trash, used shells, and gear. Help us keep the
            land clean and ready for the next hunt.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
            R — Respect fellow hunters
          </h2>
          <p className="ml-5 text-neutral-400!">
            Be courteous and professional toward everyone on the property. Your
            behavior reflects on all of us.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
            I — Intoxicated hunters will not be tolerated
          </h2>
          <p className="ml-5 text-neutral-400!">
            Responsible alcohol consumption is allowed, but any reckless or
            unsafe behavior — including handling firearms while visibly impaired
            — will result in immediate removal from the property.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
            M — Maintain safe distance between areas
          </h2>
          <p className="ml-5 text-neutral-400!">
            Stay aware of your surroundings and avoid hunting too close to other
            groups. Keep a courteous, safe buffer.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
            E — Elevate your shots
          </h2>
          <p className="ml-5 text-neutral-400!">
            Never shoot low over the fields. Always elevate your aim to avoid
            endangering others.
          </p>
        </div>
      </div>

      <p className="text-center text-lg mt-12 font-broadsheet text-[var(--color-accent-sage)]">
        Thank you for helping us keep the ranch safe, respectful, and fun for
        everyone.
      </p>
    </section>
  );
};

export default PropertyRules;
