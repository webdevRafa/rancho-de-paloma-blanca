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
    <div className="flex flex-col min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
      {/* Hero Section */}
      <HeroSection />
      <div
        data-aos="fade-in"
        className="py-10 text-center bg-gradient-to-b from-[var(--color-footer)] to-[var(--color-background)]"
      >
        <h2 id="info" className="text-4xl md:text-5xl mb-2 text-white">
          Why Choose Rancho de Paloma Blanca?
        </h2>
        <p className="text-md max-w-3xl mx-auto mb-10">
          We offer premium guided hunts, breathtaking Texas landscapes, and a
          ranch experience designed for hunters of all levels.
        </p>
      </div>
      {/* Section with birds background */}
      <section
        className="py-20 px-6 w-full mx-auto text-center"
        style={{
          backgroundImage: `url(${birds})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: isIOS ? "scroll" : "fixed", // Avoid iOS scroll bugs
        }}
      >
        <div className="py-10">
          <InfoCards />
        </div>
      </section>
    </div>
  );
};

export default HomePage;
