import HeroSection from "../components/HeroSection";

const HomePage = () => {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
      {/* Hero Section */}
      <HeroSection />

      {/* Placeholder for other sections (to build later) */}
      <section className="py-20 px-6 max-w-6xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-semibold mb-6 text-[var(--color-accent-gold)]">
          Why Choose Rancho de Paloma Blanca?
        </h2>
        <p className="text-lg max-w-3xl mx-auto mb-10">
          Premium guided hunts, breathtaking Texas landscapes, and a ranch
          experience designed for hunters of all levels.
        </p>

        {/* Placeholder buttons or cards (can expand into full section) */}
        <div className="flex flex-col md:flex-row justify-center gap-8">
          <div className="bg-[var(--color-card)] rounded-lg p-6 shadow-lg flex-1">
            <h3 className="text-xl font-bold mb-4 text-[var(--color-accent-gold)]">
              Guided Hunts
            </h3>
            <p>
              Join our experienced guides for unforgettable hunts on pristine
              Texas land.
            </p>
          </div>
          <div className="bg-[var(--color-card)] rounded-lg p-6 shadow-lg flex-1">
            <h3 className="text-xl font-bold mb-4 text-[var(--color-accent-gold)]">
              Scenic Property
            </h3>
            <p>
              Explore rolling landscapes and well-managed grounds perfect for
              outdoor enthusiasts.
            </p>
          </div>
          <div className="bg-[var(--color-card)] rounded-lg p-6 shadow-lg flex-1">
            <h3 className="text-xl font-bold mb-4 text-[var(--color-accent-gold)]">
              Book Online
            </h3>
            <p>
              Secure your spot with our easy online booking system in just a few
              clicks.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
