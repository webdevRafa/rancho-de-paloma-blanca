// /pages/BackTheBluePage.tsx
import { Link } from "react-router-dom";
import { TiArrowBack } from "react-icons/ti";
import { RxCrosshair2 } from "react-icons/rx";
import groupBg from "../assets/images/group.webp";
import BackTheBlueEventCard from "../components/BackTheBlueEventCard";
import { BACK_THE_BLUE_DATE_LABEL } from "../utils/huntPricing";

const BackTheBluePage = () => {
  return (
    <>
      {/* Background image + gradient wash */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <img
          src={groupBg}
          alt=""
          className="h-full w-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_30%,rgba(0,0,0,0.25)_55%,var(--color-footer)_100%)]" />
      </div>

      {/* Top action */}
      <div className="container mx-auto px-4 pt-28 sm:pt-36">
        <div className="flex justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-gin text-sm rounded-xl border border-white/15 px-4 py-2 backdrop-blur transition bg-white/80"
          >
            <TiArrowBack className="text-lg" />
            Back to Home
          </Link>
        </div>
      </div>

      {/* Main content */}
      <section className="container mx-auto px-4 py-10 sm:py-14">
        <div
          data-aos="fade-up"
          className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 md:gap-10"
        >
          {/* Current event details */}
          <div className="flex items-start justify-center">
            <div className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-xl">
              <BackTheBlueEventCard />
            </div>
          </div>

          {/* Right: Event copy + CTAs */}
          <div className="flex flex-col justify-center">
            <h1 className="font-gin text-3xl/tight sm:text-4xl/tight md:text-5xl/tight text-white">
              Back the Blue Dove Hunt
            </h1>

            <p className="mt-3 text-white/80">
              Honoring our heroes with a day in the field.
            </p>

            <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-white/90">
              <p>
                On <strong>Saturday, {BACK_THE_BLUE_DATE_LABEL}</strong>, Rancho de Paloma
                Blanca is proud to host our{" "}
                <strong>Back the Blue Dove Hunt</strong>, postponed one week due to weather. This
                special event is dedicated to first responders — police, fire,
                EMS, and other frontline heroes.
              </p>
              <p>
                Enjoy a full day of world-class South Texas dove hunting at a{" "}
                <strong className="text-[var(--color-accent-gold,#f5c26b)]">
                  special rate of only $50 per hunter, per day
                </strong>{" "}
                for first responders and their guests.
              </p>

              <ul className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
                <li>
                  🗓 <strong>Date:</strong> Saturday, {BACK_THE_BLUE_DATE_LABEL}
                </li>
                <li>
                  🎯 <strong>Rate:</strong> $50 per hunter, per day
                </li>
                <li>
                  👥 <strong>Who:</strong> Law enforcement, firefighters, EMS,
                  and other first responders, along with their guests
                </li>
                <li>
                  🌵 <strong>Where:</strong> Rancho de Paloma Blanca —
                  Rio Hondo, TX
                </li>
              </ul>

              <p>
                Come out and join us for a day of camaraderie, appreciation, and
                great hunting. Limited spots — reserve early.
              </p>
            </div>

            {/* CTAs */}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/book"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-[var(--color-blue)] hover:bg-[var(--color-bluedarker)] border-white/15  px-5 py-3 font-semibold text-white/90 backdrop-blur transition"
              >
                Secure your Spot
                <RxCrosshair2 className="text-lg" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 font-medium text-white/90 backdrop-blur transition hover:bg-white/10"
              >
                Contact for Details
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default BackTheBluePage;
