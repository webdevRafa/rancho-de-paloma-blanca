// src/pages/HomePage.tsx
import { useEffect, useRef } from "react";
import HeroSection from "../components/HeroSection";
import heroImg from "../assets/images/four.webp";
import logo from "../assets/logo-official.webp";
import { FaFlagUsa } from "react-icons/fa";
import { Link } from "react-router-dom";
import Photos from "../components/Photos";
import PhotosTwo from "../components/PhotosTwo";
import PartyDeck from "../components/PartyDeck";

const HomePage = () => {
  // Keep iOS detection for the birds section behavior below

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
          style={{ top: "-10vh", opacity: 0.29 }} // CHANGED: set base opacity inline so JS can override it
        />

        {/* Content */}
        <div className="relative z-10 text-center px-6">
          <div
            data-aos="zoom-in"
            data-aos-duration="1000"
            className="flex flex-row items-center max-w-[300px] md:max-w-[400px] mx-auto"
          >
            <img
              className="h-[130px] md:h-[150px] max-h-[200px] max-w-[300px] mx-auto"
              src={logo}
              alt=""
            />
          </div>

          <div className=" p-1 mb-2">
            <h1
              data-aos="fade-in"
              data-aos-delay="1000"
              className="text-white font-gin mt-6 mb-3 max-w-[800px] mx-auto text-2xl"
            >
              Best Dove Hunting in Brownsville, Texas — Rancho de Paloma Blanca
            </h1>
            <p
              data-aos="fade-in"
              data-aos-delay="1500"
              className="text-sm md:text-base text-neutral-100/90 max-w-[760px] mx-auto mb-5 font-acumin"
            >
              Dove Hunting at <strong>Rancho de Paloma Blanca</strong> in{" "}
              <strong>Brownsville</strong> is perfect for families, friends, and
              larger groups. Choose flexible single-day hunts or weekend
              packages, add the exclusive Party Deck, and enjoy seamless online
              booking—everything you need for a memorable South Texas hunt.
            </p>
          </div>

          <div
            data-aos="fade-up"
            data-aos-delay="2000"
            className="flex items-center justify-center gap-2"
          >
            <a
              href="/book"
              className="inline-block p-2 text-white font-acumin bg-[var(--color-card)]/40 border-[var(--color-accent-gold)]/50 border-2 hover:bg-[var(--color-card)]/80 hover:scale-105 text-sm transition duration-300 ease-in-out"
            >
              Book Your Hunt
            </a>
            <Link
              to="/backtheblue"
              className="text-white bg-gradient-to-b font-gin hover:scale-105 cursor-pointer from-[var(--color-blue)] to-[var(--color-bluedarker)] flex gap-2 items-center justify-center p-1.5"
            >
              Back the Blue
              <FaFlagUsa />
            </Link>
          </div>
        </div>
      </div>
      <Photos />
      {/* Rest of page */}
      <div className="flex flex-col min-h-screen text-[var(--color-text)]">
        {/* Hero Section */}
        <HeroSection />

        <PartyDeck />
        <PhotosTwo />
      </div>
    </>
  );
};

export default HomePage;
