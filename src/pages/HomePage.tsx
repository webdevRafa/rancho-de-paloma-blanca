import { useEffect, useState, useRef } from "react";
import HeroSection from "../components/HeroSection";
import InfoCards from "../components/InfoCards";
import birds from "../assets/images/palomas.webp";
import heroImg from "../assets/images/1000024263.webp";
import logo from "../assets/logo-official.webp";

const HomePage = () => {
  // Keep iOS detection for the birds section behavior below
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent || navigator.vendor;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));
  }, []);

  // Parallax: apply to the hero image on ALL devices
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    let raf = 0;
    const strength = 0.85; // parallax strength (tweak as desired)

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY * strength;
        if (imgRef.current) {
          imgRef.current.style.transform = `translate3d(0, ${y}px, 0)`;
        }
        raf = 0;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // initial position

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      {/* HERO (parallax on all devices) */}
      <div className="relative w-full h-[100vh] flex items-center justify-center overflow-hidden">
        {/* Dark overlay so text stays readable regardless of image brightness */}
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />

        {/* Parallax layer (always shown; JS translates on scroll) */}
        <img
          ref={imgRef}
          src={heroImg}
          alt=""
          className="absolute inset-0 w-full h-[120vh] object-cover opacity-60 will-change-transform"
          style={{ top: "-10vh" }} // oversize & offset to avoid edge gaps during scroll
        />

        {/* Content */}
        <div className="relative z-10 text-center px-6">
          <img className="w-30 mx-auto" src={logo} alt="" />
          <h1 className="font-light text-2xl md:text-3xl text-white mb-0 font-acumin">
            Welcome to Rancho de Paloma Blanca
          </h1>
          <p className="text-xs md:text-md max-w-2xl mx-auto mb-6 text-neutral-200">
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
          className="relative py-20 mt-40 px-6 w-[90%] mx-auto text-center"
          style={{
            backgroundImage: `url(${birds})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundAttachment: isIOS ? "scroll" : "fixed", // keep fixed for non‑iOS here
          }}
        >
          {/* Precise overlay gradient: 5% dark on left/right */}
          <div
            className="absolute inset-0 z-0 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(to right, var(--color-dark) 0%, transparent 1%, transparent 99%, var(--color-dark) 100%)`,
            }}
          />

          {/* Content */}
          <div className="relative z-10 py-10">
            <InfoCards />
          </div>
        </section>
      </div>
    </>
  );
};

export default HomePage;
