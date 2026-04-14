// src/pages/HomePage.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import HeroSection from "../components/HeroSection";
import heroImg from "../assets/images/three.webp";
import Photos from "../components/Photos";
import PhotosTwo from "../components/PhotosTwo";
import PartyDeck from "../components/PartyDeck";

// TODO: update this import path to your flyer image path
import backTheBlueFlyer from "../assets/images/btb_2026.png";

const BACK_THE_BLUE_PROMO_STORAGE_KEY = "rdpb-back-the-blue-promo-seen-2026";

const HomePage = () => {
  const navigate = useNavigate();

  const heroRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [showBackTheBluePromo, setShowBackTheBluePromo] = useState(false);
  const [showPromoTeaser, setShowPromoTeaser] = useState(false);

  useEffect(() => {
    let raf = 0;

    const parallaxStrength = 0.85;
    const baseOpacity = 0.6;
    const fadeEndFactor = 0.8;

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;

        if (imgRef.current) {
          imgRef.current.style.transform = `translate3d(0, ${
            y * parallaxStrength
          }px, 0)`;
        }

        const heroH = heroRef.current?.offsetHeight || window.innerHeight;
        const fadeEnd = heroH * fadeEndFactor;
        const progress = Math.min(1, Math.max(0, y / fadeEnd));
        const op = (1 - progress) * baseOpacity;

        if (imgRef.current) {
          imgRef.current.style.opacity = String(op);
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
    }, 900);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showBackTheBluePromo) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
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
        className="relative isolate w-full h-[100vh] flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />

        <img
          ref={imgRef}
          src={heroImg}
          alt=""
          className="absolute inset-0 w-full h-[120vh] object-cover will-change-transform blur-xs"
          style={{ top: "-10vh", opacity: 0.27 }}
        />

        <div className="text-white relative z-40 flex flex-col md:flex-row items-center justify-center gap-0">
          <div className="p-1 mb-2">
            <h1
              data-aos="fade-in"
              data-aos-delay="100"
              className="text-white font-gin mt-6 mb-3 max-w-[800px] mx-auto text-2xl md:text-3xl lg:text-5xl text-center"
            >
              Best Dove Hunting in Brownsville, Texas — Rancho de Paloma Blanca
            </h1>

            <p
              data-aos="fade-in"
              data-aos-delay="125"
              className="text-sm md:text-base text-neutral-100/90 max-w-[560px] mx-auto mb-5 font-acumin px-4"
            >
              Dove Hunting at <strong>Rancho de Paloma Blanca</strong> in{" "}
              <strong>Brownsville</strong> is perfect for families, friends, and
              larger groups. Choose flexible single-day hunts or weekend
              packages, add the exclusive Party Deck, and enjoy seamless online
              booking—everything you need for a memorable South Texas hunt.
            </p>

            <div className="flex items-center justify-center gap-2">
              <a
                data-aos="zoom-in"
                data-aos-delay="300"
                href="/book"
                className="inline-block p-2 font-gin text-[var(--color-background)] bg-white border-[var(--color-background)] border-2 hover:scale-105 text-sm transition duration-300 ease-in-out"
              >
                Book Your Hunt
              </a>
            </div>
          </div>
        </div>
      </div>

      <Photos />

      <div className="flex flex-col min-h-screen text-[var(--color-text)]">
        <HeroSection />
        <PartyDeck />
        <PhotosTwo />
      </div>

      {/* Floating teaser after dismiss */}
      <AnimatePresence>
        {showPromoTeaser && !showBackTheBluePromo && (
          <motion.button
            type="button"
            onClick={openPromo}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-4 right-4 z-[90] max-w-[320px] rounded-2xl border border-white/10 bg-[var(--color-footer)]/95 px-4 py-3 text-left shadow-2xl backdrop-blur"
          >
            <div className="flex items-start gap-3">
              <img
                src={backTheBlueFlyer}
                alt="Back the Blue event flyer"
                className="h-14 w-14 rounded-lg object-cover border border-white/10"
              />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-accent-gold)]">
                  October 3rd Event
                </p>
                <p className="mt-1 text-sm font-semibold text-white leading-5">
                  Back the Blue Dove Hunt
                </p>
                <p className="mt-1 text-xs text-white/70">
                  View flyer and event details
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
            className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissPromo}
          >
            <div
              className="absolute inset-0 flex items-start sm:items-center justify-center px-4 pt-6 sm:pt-0 pb-4 sm:py-8"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.98 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-5xl h-[calc(100vh-40px)] sm:h-auto sm:max-h-[92vh] overflow-hidden rounded-[28px] border border-white/10 bg-[var(--color-footer)] text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
              >
                <div className="grid h-full lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="relative bg-[var(--color-dark)] p-3 sm:p-4 lg:p-0">
                    {/* Mobile / tablet: show full flyer */}
                    <div className="lg:hidden overflow-hidden rounded-2xl border border-white/10 bg-white/95">
                      <img
                        src={backTheBlueFlyer}
                        alt="2nd Annual Back the Blue Dove Hunt flyer"
                        className="w-full h-auto max-h-[48vh] object-contain bg-white"
                      />
                    </div>

                    {/* Desktop: keep the current immersive cropped panel */}
                    <div className="hidden lg:block h-full">
                      <img
                        src={backTheBlueFlyer}
                        alt="2nd Annual Back the Blue Dove Hunt flyer"
                        className="w-full h-full object-cover max-h-[92vh]"
                      />
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col">
                    <div className="promo-scroll min-h-0 flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-gold)]">
                        Special Event
                      </p>

                      <h2 className="mt-3 text-3xl md:text-4xl font-gin leading-tight text-white">
                        Back the Blue Dove Hunt
                      </h2>

                      <p className="mt-3 text-sm md:text-base text-white/80 leading-7">
                        Join Rancho de Paloma Blanca for the October 3rd event
                        in support of first responders and military families.
                      </p>

                      <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                            Date
                          </p>
                          <p className="mt-1 text-base font-semibold text-white">
                            October 3rd, 2026
                          </p>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                            Location
                          </p>
                          <p className="mt-1 text-base font-semibold text-white">
                            Brownsville, Texas
                          </p>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                            Event Pricing
                          </p>
                          <p className="mt-1 text-base font-semibold text-white">
                            $50 per gun
                          </p>
                        </div>
                      </div>

                      <div className="h-6 sm:h-0" />
                    </div>

                    <div className="sticky bottom-0 z-10 border-t border-white/10 bg-[var(--color-footer)]/95 px-5 py-4 backdrop-blur md:px-8 lg:px-10">
                      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
                        <button
                          type="button"
                          onClick={dismissPromo}
                          className="w-full sm:w-auto rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/5 transition"
                        >
                          Maybe later
                        </button>

                        <button
                          type="button"
                          onClick={handleBookEvent}
                          className="w-full sm:w-auto rounded-xl bg-[var(--color-accent-gold)] px-5 py-3 text-sm font-semibold text-[var(--color-footer)] hover:brightness-105 transition"
                        >
                          Book October 3 Event
                        </button>
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
