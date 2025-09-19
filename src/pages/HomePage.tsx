// src/pages/HomePage.tsx
import { useEffect, useState, useRef } from "react";
import HeroSection from "../components/HeroSection";
import InfoCards from "../components/InfoCards";
import birds from "../assets/images/palomas.webp";
import heroImg from "../assets/images/four.webp";
import logo from "../assets/logo-official.webp";
import rdpb from "../assets/block.svg";

const HomePage = () => {
  // Keep iOS detection for the birds section behavior below
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent || navigator.vendor;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));
  }, []);

  // Parallax + Fade: apply to the hero image on ALL devices
  const heroRef = useRef<HTMLDivElement>(null); // NEW
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let raf = 0;

    // Tunables
    const parallaxStrength = 0.85; // how much the image shifts
    const baseOpacity = 0.6; // starting opacity (matches your old opacity-60)
    const fadeEndFactor = 0.8; // reach full fade-out ~80% through the hero

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;

        // Parallax translate
        if (imgRef.current) {
          imgRef.current.style.transform = `translate3d(0, ${
            y * parallaxStrength
          }px, 0)`;
        }

        // Fade based on how far through the hero we are
        const heroH = heroRef.current?.offsetHeight || window.innerHeight;
        const fadeEnd = heroH * fadeEndFactor;
        const progress = Math.min(1, Math.max(0, y / fadeEnd)); // 0 → 1
        const op = (1 - progress) * baseOpacity;

        if (imgRef.current) {
          imgRef.current.style.opacity = String(op);
        }

        raf = 0;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // set initial position/opacity

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      {/* HERO (parallax + fade on scroll) */}
      <div
        data-aos="fade-in"
        data-aos-duration="2000"
        ref={heroRef}
        className="relative w-full h-[100vh] flex items-center justify-center overflow-hidden"
      >
        {/* Dark overlay so text stays readable regardless of image brightness */}
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />

        {/* Parallax layer */}
        <img
          ref={imgRef}
          src={heroImg}
          alt=""
          className="absolute inset-0 w-full h-[120vh] object-cover will-change-transform blur-xs" // CHANGED: removed opacity-60 class
          style={{ top: "-10vh", opacity: 0.3 }} // CHANGED: set base opacity inline so JS can override it
        />

        {/* Content */}
        <div className="relative z-10 text-center px-6">
          <div className="flex flex-row items-center">
            <img
              className="h-[100px] md:h-full max-h-[200px] max-w-[300px] mx-auto"
              src={logo}
              alt=""
            />
            <img className="w-full max-w-[260px] " src={rdpb} alt="" />
          </div>

          <p className="text-xs md:text-md max-w-2xl text-center mt-4 mx-auto mb-6 text-neutral-200">
            Experience premium hunts and the beauty of Texas outdoors.
          </p>
          <a
            href="/book"
            className="inline-block p-2 text-white font-acumin bg-[var(--color-card)]/40 border-[var(--color-accent-gold)]/50 border-2 hover:bg-[var(--color-card)]/80 hover:scale-105 text-sm transition duration-300 ease-in-out"
          >
            Book Your Hunt
          </a>
        </div>
      </div>

      {/* Rest of page */}
      <div className="flex flex-col min-h-screen text-[var(--color-text)]">
        {/* Hero Section */}
        <HeroSection />

        {/* Section with birds background */}
        <section
          className="relative py-20 mt-40 px-6 w-[90%] mx-auto text-center  shadow-lg shadow-amber-50/10"
          style={{
            backgroundImage: `url(${birds})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundAttachment: isIOS ? "scroll" : "fixed",
          }}
        >
          {/* 1) global tint to reduce background brightness */}
          <div className="absolute inset-0 z-0 pointer-events-none bg-[var(--color-dark)]/40" />

          {/* 2) your existing precise side gradient on top of the tint */}
          <div
            className="absolute inset-0 z-0 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(to right, var(--color-dark) 0%, transparent 1%, transparent 99%, var(--color-dark) 100%)`,
            }}
          />

          {/* Content stays above overlays */}
          <div className="relative z-10 py-10">
            <InfoCards />
          </div>
        </section>
      </div>
    </>
  );
};

export default HomePage;
