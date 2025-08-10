import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const InfoCards = () => {
  const cards = [
    {
      title: "Premium Hunts",
      text: "unforgettable hunts on pristine Texas land.",
    },
    {
      title: "Scenic Property",
      text: "Explore rolling landscapes and well-managed grounds perfect for hunters.",
    },
    {
      title: "Easy Booking",
      text: "Secure your spot with our quick and simple online booking system.",
    },
  ];

  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % cards.length);
    }, 4500); // rotate every 4 seconds
    return () => clearInterval(interval);
  }, [cards.length]);

  return (
    <section className="relative py-20 flex justify-center items-center overflow-hidden h-[250px]">
      <div className="w-full max-w-xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.6 }}
            className="absolute max-w-[500px] mx-auto inset-0 flex flex-col items-center text-center text-[var(--color-text)] p-10 rounded-xl"
          >
            <h3 className="text-4xl md:text-5xl text-[var(--color-accent-gold)] mb-4">
              {cards[current].title}
            </h3>
            <p className="text-base max-w-md">{cards[current].text}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};

export default InfoCards;
