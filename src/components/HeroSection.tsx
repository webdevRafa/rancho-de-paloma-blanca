import { useEffect, useState } from "react";
import logo from "../assets/rdp-white.svg";

const HeroSection = () => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setOffset(window.scrollY * 0.4);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section className="relative text-[var(--color-text)] min-h-[80vh] flex items-center justify-center overflow-hidden">
      {/* Background Video */}
      <div className="absolute inset-0 overflow-hidden">
        <video
          className="w-full h-full object-cover opacity-40 blur-xs"
          src="https://player.vimeo.com/progressive_redirect/playback/1105476172/rendition/1080p/file.mp4?loc=external&signature=9bd7a4ea1f8b8264af6c49d9168fec5bd90837b92a67d86d3de8d027d5f17f9b"
          autoPlay
          muted
          loop
          playsInline
        >
          Your browser does not support the video tag.
        </video>
        <div
          className="absolute inset-0  bg-opacity-50"
          style={{ transform: `translateY(${offset * 0.5}px)` }}
        />
      </div>

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
          className="inline-block px-5 py-3 bg-[var(--color-background)] hover:bg-[var(--color-card)] text-white text-lg font-medium rounded-md transition"
        >
          Book Your Hunt
        </a>
      </div>
    </section>
  );
};

export default HeroSection;
