import HeroSection from "../components/HeroSection";
import InfoCards from "../components/InfoCards";

const HomePage = () => {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
      {/* Hero Section */}
      <HeroSection />

      {/* Placeholder for other sections (to build later) */}
      <section className="py-20 px-6 max-w-6xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl mb-2 text-[var(--color-button)]">
          Why Choose Rancho de Paloma Blanca?
        </h2>
        <p className="text-md max-w-3xl mx-auto mb-10 text-white">
          We offer premium guided hunts, breathtaking Texas landscapes, and a
          ranch experience designed for hunters of all levels.
        </p>

        <InfoCards />
      </section>
    </div>
  );
};

export default HomePage;
