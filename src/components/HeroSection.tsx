import { useEffect, useState } from "react";
import heroImgDesktop from "../assets/hero-img.webp";
import heroImgMobile from "../assets/heroImgTall.webp";
import logo from "../assets/rdp-white.svg";

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
        className="absolute inset-0 bg-cover bg-center opacity-30 md:hidden blur-xs"
        style={{
          backgroundImage: `url(${heroImgMobile})`,
          transform: `translateY(${offset * 1}px)`,
          willChange: "transform",
        }}
      />

      {/* Desktop Background (parallax) */}
      <div
        className="hidden md:block absolute inset-0 bg-cover bg-center opacity-30 blur-x"
        style={{
          backgroundImage: `url(${heroImgDesktop})`,
          transform: `translateY(${offset * 2}px)`,
          willChange: "transform",
        }}
      />

      {/* Content */}
      <div className="relative z-10 text-center px-6">
        <img className="w-40 mx-auto" src={logo} alt="" />
        <h1 className="font-light text-2xl md:text-4xl text-white mb-0">
          Welcome to Rancho de Paloma Blanca
        </h1>
        <p className="text-sm md:text-md max-w-2xl mx-auto mb-6 ">
          Experience premium guided hunts and the beauty of Texas outdoors.
        </p>
        <a
          href="/book"
          className="inline-block px-5 py-3 bg-[var(--color-background)] hover:bg-[var(--color-card)] text-white text-lg font-medium rounded-md  transition"
        >
          Book Your Hunt
        </a>
      </div>
    </section>
  );
};

export default HeroSection;
