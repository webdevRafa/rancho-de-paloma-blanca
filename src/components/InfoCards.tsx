const InfoCards = () => {
  const cards = [
    {
      title: "Guided Hunts",
      text: "Join our experienced guides for unforgettable hunts on pristine Texas land.",
      delay: 0,
    },
    {
      title: "Scenic Property",
      text: "Explore rolling landscapes and well-managed grounds perfect for hunters.",
      delay: 200,
    },
    {
      title: "Easy Booking",
      text: "Secure your spot with our quick and simple online booking system.",
      delay: 400,
    },
  ];

  return (
    <section className="py-10 px-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row gap-8 justify-center">
        {cards.map((card, idx) => (
          <div
            key={idx}
            className="flex-1  text-[var(--color-text)] rounded-lg shadow-xl p-8 text-center 
                         hover:shadow-xl hover:scale-105 transition-transform duration-300"
            data-aos="fade-up"
            data-aos-delay={card.delay}
          >
            <h3 className="text-4xl md:text-3xl lg:text-4xl text-[var(--color-accent-gold)] mb-4">
              {card.title}
            </h3>
            <p className="text-base">{card.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default InfoCards;
