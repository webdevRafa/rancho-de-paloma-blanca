import logo from "../assets/logo-official.webp";
import birds from "../assets/images/bird-bunch.webp";

const PropertyRules = () => {
  return (
    <>
      <section
        data-aos="fade-in"
        className="bg-gradient-to-r from-[var(--color-dark)] via-[var(--color-card)] to-[var(--color-dark)] text-[var(--color-text)]  w-[90%]   max-w-6xl mx-auto my-30 rounded-lg shadow-sm relative"
      >
        {/* Header */}
        <div className="relative w-full py-5">
          <h1 className="text-4xl font-broadsheet text-[var(--color-accent-gold)] mb-2 text-center">
            Hunting Rules
          </h1>
          <img className="h-30 mx-auto mb" src={logo} alt="" />
          <p className="text-lg font-broadsheet text-[var(--color-accent-sage)] mb-10 text-center">
            1419 Ranch, LLC
          </p>
          <div className="absolute top-0 left-0 w-full h-[220px] z-[-1] overflow-hidden ">
            <img className="object-contain opacity-[4%]" src={birds} alt="" />
          </div>
        </div>

        {/* C.R.I.M.E. Breakdown */}
        <div className="space-y-8 font-acumin text-[var(--color-text)]">
          <div>
            <h2 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
              <span className="opacity-100">C</span>{" "}
              <span className="opacity-50">— Clean up your area</span>
            </h2>
            <p className="ml-5 text-neutral-400! text-md">
              Please pick up all trash, used shells, and gear. Help us keep the
              land clean and ready for the next hunt.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
              <span className="opacity-100">R</span>{" "}
              <span className="opacity-50">— Respect fellow hunters</span>
            </h2>
            <p className="ml-5 text-neutral-400! text-md">
              Be courteous and professional toward everyone on the property.
              Your behavior reflects on all of us.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
              <span className="opacity-100">I</span>{" "}
              <span className="opacity-50">
                — Intoxicated hunters will not be tolerated
              </span>
            </h2>
            <p className="ml-5 text-neutral-400! text-md">
              Responsible alcohol consumption is allowed, but any reckless or
              unsafe behavior — including handling firearms while visibly
              impaired — will result in immediate removal from the property.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
              <span className="opacity-100">M</span>{" "}
              <span className="opacity-50">
                — Maintain safe distance between areas
              </span>
            </h2>
            <p className="ml-5 text-neutral-400! text-md">
              Stay aware of your surroundings and avoid hunting too close to
              other groups. Keep a courteous, safe buffer.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-broadsheet text-[var(--color-accent-gold)] mb-2">
              <span className="opacity-100">E</span>{" "}
              <span className="opacity-50">— Elevate your shots</span>
            </h2>
            <p className="ml-5 text-neutral-400! text-md">
              Never shoot low over the fields. Always elevate your aim to avoid
              endangering others.
            </p>
          </div>
        </div>

        <p className="text-center text-md  mt-12  font-extralight opacity-80 text-[var(--color-accent-sage)] bg-[var(--color-dark)] py-5">
          Thank you for helping us keep the ranch safe, respectful, and fun for
          everyone.
        </p>
      </section>
    </>
  );
};

export default PropertyRules;
