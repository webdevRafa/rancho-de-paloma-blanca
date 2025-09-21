import { motion } from "framer-motion";
import partyDeck from "../assets/images/1000024264.webp";

const PartyDeck = () => {
  return (
    <div className="w-full px-4 md:px-8 py-10">
      <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start md:items-stretch">
        {/* Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full md:w-auto"
          data-aos="zoom-in"
          data-aos-delay="50"
        >
          <img
            className="w-full max-w-[860px] rounded-2xl shadow-lg border border-white/10 object-cover"
            src={partyDeck}
            alt="Rancho de Paloma Blanca two-story Party Deck"
          />
        </motion.div>

        {/* Content */}
        <div className="w-full max-w-2xl">
          <motion.h1
            className="text-3xl md:text-4xl font-gin text-white mb-3"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          >
            Party Deck
          </motion.h1>

          <motion.p
            className="text-neutral-200/90 leading-relaxed mb-5"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
            data-aos="fade-up"
            data-aos-delay="100"
          >
            Our <span className="font-semibold">two-story</span> Party Deck
            overlooks the fields— perfect for regrouping between flights,
            grilling after a great morning, or hosting friends and family in
            comfort. Power, shade, and airflow are all handled so you can focus
            on a good time.
          </motion.p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <motion.div
              className="rounded-xl border border-white/10 bg-white/5 p-4"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                duration: 0.45,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.18,
              }}
              data-aos="fade-up"
              data-aos-delay="150"
            >
              <h3 className="text-white font-medium mb-1">
                Cooking & Refreshments
              </h3>
              <ul className="text-neutral-200/90 text-sm space-y-1.5 list-disc pl-5">
                <li>Full-size grill for post-hunt cookouts</li>
                <li>Two dedicated bars for setup & serving</li>
                <li>Running water on site</li>
              </ul>
            </motion.div>

            <motion.div
              className="rounded-xl border border-white/10 bg-white/5 p-4"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                duration: 0.45,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.24,
              }}
              data-aos="fade-up"
              data-aos-delay="200"
            >
              <h3 className="text-white font-medium mb-1">
                Comfort & Utilities
              </h3>
              <ul className="text-neutral-200/90 text-sm space-y-1.5 list-disc pl-5">
                <li>Electricity for lights, music, and gear</li>
                <li>Multiple fans to keep air moving</li>
                <li>Private port-a-john (portable restroom)</li>
              </ul>
            </motion.div>

            <motion.div
              className="rounded-xl border border-white/10 bg-white/5 p-4 sm:col-span-2"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                duration: 0.45,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.3,
              }}
              data-aos="fade-up"
              data-aos-delay="250"
            >
              <h3 className="text-white font-medium mb-1">
                Hunt-Ready Storage
              </h3>
              <ul className="text-neutral-200/90 text-sm space-y-1.5 list-disc pl-5">
                <li>
                  Secure <span className="font-semibold">20-gun</span> rack for
                  organized safekeeping
                </li>
              </ul>
            </motion.div>
          </div>

          <motion.p
            className="text-neutral-300/90 text-sm"
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.45, delay: 0.35 }}
            data-aos="fade-up"
            data-aos-delay="300"
          >
            Note: The Party Deck is available as an optional add-on during
            checkout and may be reserved on a per-day basis. Availability is
            limited—first come, first served.
          </motion.p>
        </div>
      </div>
    </div>
  );
};

export default PartyDeck;
