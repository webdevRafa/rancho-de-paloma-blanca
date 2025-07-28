import { useEffect, useState } from "react";
import heroImgDesktop from "../assets/hero-img.webp";
import heroImgMobile from "../assets/heroImgTall.webp";

const HeroSection = () => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setOffset(window.scrollY * 0.4); // Adjust multiplier for speed (0.2 = subtle, 0.5 = stronger)
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section className="relative text-[var(--color-text)] min-h-[80vh] flex items-center justify-center overflow-hidden">
      {/* Mobile Background (parallax) */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40 md:hidden"
        style={{
          backgroundImage: `url(${heroImgMobile})`,
          transform: `translateY(${offset * 1}px)`,
          willChange: "transform",
        }}
      />

      {/* Desktop Background (parallax) */}
      <div
        className="hidden md:block absolute inset-0 bg-cover bg-center opacity-40"
        style={{
          backgroundImage: `url(${heroImgDesktop})`,
          transform: `translateY(${offset * 2}px)`,
          willChange: "transform",
        }}
      />

      {/* Content */}
      <div className="relative z-10 text-center px-6">
        <h1 className="text-4xl md:text-6xl font-bold mb-4">
          Welcome to Rancho de Paloma Blanca
        </h1>
        <p className="text-lg md:text-2xl max-w-2xl mx-auto mb-6">
          Experience premium guided hunts and the beauty of Texas outdoors.
        </p>
        <a
          href="/book"
          className="inline-block px-8 py-4 bg-[var(--color-button)] text-white text-lg font-medium rounded-lg hover:bg-[var(--color-button-hover)] transition"
        >
          Book Your Hunt
        </a>
      </div>
    </section>
  );
};

export default HeroSection;
