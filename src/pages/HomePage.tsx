import { useEffect, useState } from "react";
import HeroSection from "../components/HeroSection";
import InfoCards from "../components/InfoCards";
import birds from "../assets/images/palomas.webp";

const HomePage = () => {
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS (iPhone/iPad)
    const ua = window.navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));
  }, []);

  return (
    <div className="flex flex-col min-h-screen  text-[var(--color-text)]">
      {/* Hero Section */}
      <HeroSection />
      <div
        data-aos="fade-in"
        className="py-10 text-center bg-gradient-to-r from-[var(--color-dark)] via-[var(--color-footer)] to-[var(--color-dark)]"
      >
        <h2 id="info" className="text-4xl md:text-5xl mb-2 text-white pt-10">
          Why Choose Rancho de Paloma Blanca?
        </h2>
        <p className="text-md max-w-3xl mx-auto mb-10">
          We offer premium hunts, breathtaking Texas landscapes, and a ranch
          experience designed for hunters of all levels.
        </p>
      </div>
      {/* Section with birds background */}
      <section
        className="relative py-20 px-6 w-[90%] mx-auto text-center"
        style={{
          backgroundImage: `url(${birds})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: isIOS ? "scroll" : "fixed",
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
  );
};

export default HomePage;
