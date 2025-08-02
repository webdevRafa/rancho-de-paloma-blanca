const PropertyRules = () => {
  return (
    <section className="bg-[var(--color-card)] text-[var(--color-text)] px-6 py-16 max-w-4xl my-30 mx-auto rounded-lg shadow-lg">
      <h1 className="text-[var(--color-accent-gold)] text-4xl font-broadsheet mb-6">
        Property Rules & Hunting Etiquette
      </h1>
      <div className="space-y-6 text-[var(--color-text)] text-base leading-relaxed font-acumin">
        <p>
          Welcome to Rancho de Paloma Blanca. We’re proud to offer a safe and
          respectful hunting environment. Before your hunt, please read the
          following rules carefully.
        </p>

        <h2 className="text-[var(--color-accent-sage)] text-2xl font-broadsheet mt-8">
          General Conduct
        </h2>
        <ul className="list-disc list-inside space-y-2">
          <li>Always treat firearms with care and respect.</li>
          <li>No alcohol consumption before or during your hunt.</li>
          <li>Clean up after yourself — leave no trash behind.</li>
        </ul>

        <h2 className="text-[var(--color-accent-sage)] text-2xl font-broadsheet mt-8">
          Safety Guidelines
        </h2>
        <ul className="list-disc list-inside space-y-2">
          <li>Wear blaze orange when moving through open areas.</li>
          <li>Keep your muzzle pointed in a safe direction at all times.</li>
          <li>Do not shoot unless you’re 100% sure of your target.</li>
        </ul>

        <h2 className="text-[var(--color-accent-sage)] text-2xl font-broadsheet mt-8">
          Property Rules
        </h2>
        <ul className="list-disc list-inside space-y-2">
          <li>Stay within designated hunting zones.</li>
          <li>No unauthorized vehicles beyond the ranch gate.</li>
          <li>Campfires must be approved by ranch staff beforehand.</li>
        </ul>

        <h2 className="text-[var(--color-accent-sage)] text-2xl font-broadsheet mt-8">
          Game & Harvest
        </h2>
        <ul className="list-disc list-inside space-y-2">
          <li>All game must be logged with staff immediately after harvest.</li>
          <li>Do not exceed your tag or limit for any species.</li>
          <li>We reserve the right to inspect game bags or vehicles.</li>
        </ul>

        <p className="mt-8">
          By entering the ranch, you agree to follow these rules. Violators may
          be asked to leave without refund.
        </p>

        <p className="text-[var(--color-accent-gold)] font-broadsheet mt-6 text-center text-lg">
          Thank you for respecting the land — and the hunt.
        </p>
      </div>
    </section>
  );
};

export default PropertyRules;
