// src/pages/HomePage.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import HeroSection from "../components/HeroSection";
import heroImg from "../assets/images/three.webp";
import Photos from "../components/Photos";
import PhotosTwo from "../components/PhotosTwo";
import PartyDeck from "../components/PartyDeck";
import backTheBlueFlyer from "../assets/images/btb_2026.png";

const BACK_THE_BLUE_PROMO_STORAGE_KEY = "rdpb-back-the-blue-promo-seen-2026";
const HERO_PARALLAX_STRENGTH = 0.85;
const HERO_BASE_OPACITY = 0.2;
const HERO_FADE_END_FACTOR = 0.8;

const HomePage = () => {
  const navigate = useNavigate();

  const heroRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const currentHeroOpacityRef = useRef(HERO_BASE_OPACITY);

  const [showBackTheBluePromo, setShowBackTheBluePromo] = useState(false);
  const [showPromoTeaser, setShowPromoTeaser] = useState(false);

  useEffect(() => {
    let raf = 0;

    const parallaxStrength = HERO_PARALLAX_STRENGTH;
    const baseOpacity = HERO_BASE_OPACITY;
    const fadeEndFactor = HERO_FADE_END_FACTOR;

    currentHeroOpacityRef.current = baseOpacity;

    const onScroll = () => {
      if (raf) return;

      raf = requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);

        if (imgRef.current) {
          imgRef.current.style.transform = `translate3d(0, ${
            y * parallaxStrength
          }px, 0)`;
        }

        const heroH = heroRef.current?.offsetHeight || window.innerHeight;
        const fadeEnd = heroH * fadeEndFactor;
        const progress = Math.min(1, y / fadeEnd);
        const nextOpacity = (1 - progress) * baseOpacity;

        const smoothing = 0.14;
        const targetOpacity = nextOpacity;

        currentHeroOpacityRef.current =
          currentHeroOpacityRef.current +
          (targetOpacity - currentHeroOpacityRef.current) * smoothing;

        if (Math.abs(targetOpacity - currentHeroOpacityRef.current) < 0.001) {
          currentHeroOpacityRef.current = targetOpacity;
        }

        if (imgRef.current) {
          imgRef.current.style.opacity = String(currentHeroOpacityRef.current);
        }

        raf = 0;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const alreadySeen =
      sessionStorage.getItem(BACK_THE_BLUE_PROMO_STORAGE_KEY) === "true";

    if (alreadySeen) {
      setShowPromoTeaser(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowBackTheBluePromo(true);
    }, 1250);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showBackTheBluePromo) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [showBackTheBluePromo]);

  const dismissPromo = () => {
    sessionStorage.setItem(BACK_THE_BLUE_PROMO_STORAGE_KEY, "true");
    setShowBackTheBluePromo(false);
    setShowPromoTeaser(true);
  };

  const openPromo = () => {
    setShowBackTheBluePromo(true);
  };

  const handleBookEvent = () => {
    sessionStorage.setItem(BACK_THE_BLUE_PROMO_STORAGE_KEY, "true");
    setShowBackTheBluePromo(false);
    setShowPromoTeaser(false);
    navigate("/book");
  };

  return (
    <>
      {/* HERO */}
      <div
        data-aos-duration="2000"
        ref={heroRef}
        className="relative isolate flex h-[100vh] w-full items-center justify-center overflow-hidden"
      >
        <img
          ref={imgRef}
          src={heroImg}
          alt=""
          className="absolute inset-0 h-[120vh] w-full object-cover will-change-transform blur-xs"
          style={{ top: "-10vh", opacity: HERO_BASE_OPACITY }}
        />

        <div className="relative z-40 flex flex-col items-center justify-center gap-0 text-white md:flex-row">
          <div className="mb-2 p-1">
            <h1
              data-aos="fade-in"
              data-aos-delay="100"
              className="mx-auto mt-6 mb-3 max-w-[800px] text-center text-2xl text-white md:text-3xl lg:text-5xl font-gin"
            >
              Best Dove Hunting in Brownsville, Texas — Rancho de Paloma Blanca
            </h1>

            <p
              data-aos="fade-in"
              data-aos-delay="125"
              className="mx-auto mb-5 max-w-[560px] px-4 text-sm text-neutral-100/90 md:text-base font-acumin"
            >
              Dove Hunting at <strong>Rancho de Paloma Blanca</strong> in{" "}
              <strong>Brownsville</strong> is perfect for families, friends, and
              larger groups. Choose flexible single-day hunts or weekend
              packages, add the exclusive Party Deck, and enjoy seamless online
              booking—everything you need for a memorable South Texas hunt.
            </p>

            <div className="flex flex-col items-center justify-center gap-4">
              <a
                data-aos="zoom-in"
                data-aos-delay="300"
                href="/book"
                className="inline-block border-2 border-[var(--color-background)] bg-white p-2 text-sm text-[var(--color-background)] transition duration-300 ease-in-out hover:scale-105 font-gin"
              >
                Book Your Hunt
              </a>

              {showPromoTeaser && !showBackTheBluePromo && (
                <motion.button
                  type="button"
                  onClick={openPromo}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 14, scale: 0.98 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="md:hidden w-full max-w-[340px]  border border-[var(--color-accent-gold)] bg-[var(--color-footer)]/95 px-4 py-3 text-left shadow-2xl backdrop-blur"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={backTheBlueFlyer}
                      alt="Back the Blue event flyer"
                      className="h-14 w-14 rounded-lg border border-white/10 object-cover"
                    />

                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-accent-gold)]">
                        October 3rd Event
                      </p>
                      <p className="mt-1 text-sm font-semibold leading-5 text-white">
                        Back the Blue Dove Hunt
                      </p>
                      <p className="mt-1 text-xs text-white/70">
                        First responder special event pricing
                      </p>
                    </div>
                  </div>
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Photos />

      <div className="flex min-h-screen flex-col text-[var(--color-text)]">
        <HeroSection />
        <PartyDeck />
        <PhotosTwo />
      </div>

      {/* Floating teaser */}
      <AnimatePresence>
        {showPromoTeaser && !showBackTheBluePromo && (
          <motion.button
            type="button"
            onClick={openPromo}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="hidden md:block fixed right-4 z-[90] w-[calc(100%-2rem)] cursor-pointer border-2 border-[var(--color-accent-gold)] max-w-[340px] bg-[var(--color-footer)]  px-4 py-3 text-left shadow-2xl backdrop-blur bottom-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-start gap-3">
              <img
                src={backTheBlueFlyer}
                alt="Back the Blue event flyer"
                className="h-14 w-14 rounded-lg border border-white/10 object-cover"
              />

              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-accent-gold)]">
                  October 3rd Event
                </p>
                <p className="mt-1 text-sm font-semibold leading-5 text-white">
                  Back the Blue Dove Hunt
                </p>
                <p className="mt-1 text-xs text-white/70">
                  First responder special event pricing
                </p>
              </div>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Main promo modal */}
      <AnimatePresence>
        {showBackTheBluePromo && (
          <motion.div
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md "
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            onClick={dismissPromo}
          >
            <div
              className="absolute inset-0 overflow-y-auto p-3 sm:p-4 lg:flex lg:items-center lg:justify-center lg:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.975 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.985 }}
                transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
                className="relative my-3 flex w-full max-w-5xl flex-col overflow-hidden border-1 border-[var(--color-accent-gold)]/40 bg-[var(--color-footer)] text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] max-lg:min-h-0 max-lg:max-h-[calc(100dvh-1.5rem)] lg:max-h-[100vh]"
              >
                <button
                  type="button"
                  onClick={dismissPromo}
                  aria-label="Close event modal"
                  className="absolute right-3 top-3 z-30 inline-flex h-10 w-10 items-center justify-center  text-4xl bg-[var(--color-background)] text-white/70  transition  hover:text-white hover:scale-105"
                >
                  ×
                </button>

                <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  {/* Flyer panel */}
                  <div className="promo-flyer-panel flex min-h-0 flex-col ">
                    <div className=" ">
                      <div className="relative mx-auto flex h-full items-start justify-center overflow-hidden pb-3   ">
                        <img
                          src={backTheBlueFlyer}
                          alt="2nd Annual Back the Blue Dove Hunt flyer"
                          className="h-auto w-full object-contain max-h-[240px] sm:max-h-[300px] lg:max-h-[800px] lg:h-full"
                        />
                      </div>
                    </div>

                    <div className="hidden items-center justify-between gap-4 border-t border-white/10  px-5 py-4 lg:flex">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-accent-gold)]">
                          October 3rd, 2026
                        </p>
                        <p className="mt-1 text-sm text-white/75">
                          Brownsville, Texas
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right content */}
                  <div className="flex min-h-0 flex-col">
                    <div className="promo-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4 sm:px-6 sm:pt-6 sm:pb-5 md:px-7 md:pb-6 lg:px-7 lg:pt-8">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-gold)]">
                        Special Event
                      </p>

                      <h2 className="mt-3 text-[2.1rem] leading-[1.05] text-white sm:text-[2.5rem] md:text-[2.9rem] font-gin tracking-tight">
                        Back the Blue Dove Hunt
                      </h2>
                      <div className="mt-4 h-[2px] w-14 bg-[var(--color-accent-gold)] rounded-full" />

                      <p className="mt-4 max-w-[34ch] text-sm leading-7 text-white/80 md:text-[15px]">
                        Join us for a special October 3rd dove hunt created to
                        honor first responders. When a first responder books the
                        hunt, everyone in their party—including friends and
                        family—receives the special event rate of $50 per
                        hunter.
                      </p>

                      <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <div className="border border-white/10 bg-white/5 p-2">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                            Date
                          </p>
                          <p className="mt-2 text-sm font-semibold text-white">
                            October 3rd, 2026
                          </p>
                        </div>

                        <div className="border border-white/10 bg-white/5 p-2">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                            Location
                          </p>
                          <p className="mt-2 text-sm font-semibold text-white">
                            Brownsville, Texas
                          </p>
                        </div>

                        <div className=" border border-white/10 bg-white/5 p-2">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                            Special Rate
                          </p>
                          <p className="mt-2 text-sm font-semibold text-white">
                            $50 per hunter
                          </p>
                        </div>
                      </div>

                      <div className="h-6" />
                    </div>

                    <div className="promo-modal-actions shrink-0 border-t border-white/10 bg-gradient-to-t from-black/70 via-[var(--color-footer)]/98 to-[var(--color-footer)]/96 px-4 py-4 backdrop-blur sm:px-6 md:px-8">
                      <div className="flex flex-col gap-4">
                        <div className="max-w-[420px]">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-accent-gold)]/90">
                            Exclusive first responder event
                          </p>

                          <div className="mt-2 flex flex-col gap-1 text-sm text-white/78 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                            <span className="text-base font-semibold text-white">
                              $50 per hunter
                            </span>
                            <span className="hidden h-1 w-1 rounded-full bg-white/25 sm:inline-block" />
                            <span className="text-white/72">
                              Friends & family welcome in the same booking party
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-end">
                          <button
                            type="button"
                            onClick={dismissPromo}
                            className=" inline-flex cursor-pointer w-full items-center justify-center  px-6 py-1.5 text-sm font-semibold transition sm:w-auto text-white/80 hover:text-white"
                          >
                            Maybe later
                          </button>

                          <button
                            type="button"
                            onClick={handleBookEvent}
                            className="bg-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold-hover)] text-[var(--color-background)] cursor-pointer inline-flex w-full items-center justify-center  px-6 py-1.5 text-sm font-semibold transition sm:w-auto"
                          >
                            Reserve your spot
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default HomePage;
