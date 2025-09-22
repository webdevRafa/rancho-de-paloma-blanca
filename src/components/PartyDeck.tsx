import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { storage } from "../firebase/firebaseConfig"; // make sure you export `storage` from your config
import { getDownloadURL, listAll, ref as storageRef } from "firebase/storage";

// Fallback image (your current hero) if the folder is empty or on first paint
import partyDeckFallback from "../assets/images/1000024264.webp";

// --- small helpers ---
type GalleryImage = { url: string; name: string };

const ease = [0.16, 1, 0.3, 1] as const;
const shuffle = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const usePartyDeckImages = () => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const folderRef = storageRef(storage, "partyDeck");
        const { items } = await listAll(folderRef);
        const urls = await Promise.all(
          items.map(async (it) => ({
            url: await getDownloadURL(it),
            name: it.name,
          }))
        );
        if (cancelled) return;
        setImages(urls);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Could not load partyDeck images, using fallback.", e);
        setImages([{ url: partyDeckFallback, name: "fallback" }]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Random hero (fallback only if Firebase fails)
  const { hero, thumbs } = useMemo(() => {
    if (images.length === 0) {
      return {
        hero: { url: partyDeckFallback, name: "fallback" },
        thumbs: [] as GalleryImage[],
      };
    }

    // If we ever pushed the fallback into images (catch branch),
    // treat it as "no real images" and still show it.
    const real = images.filter((i) => i.name !== "fallback");
    const pool = real.length > 0 ? real : images;

    const heroImg = pool[Math.floor(Math.random() * pool.length)];
    const remainder = pool.filter((i) => i.url !== heroImg.url);

    return { hero: heroImg, thumbs: shuffle(remainder) };
  }, [images]);

  return { loading, hero, thumbs, all: images };
};

// --- Component ---
const PartyDeck = () => {
  const { hero, thumbs, all } = usePartyDeckImages();

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const openAt = useCallback(
    (url: string) => {
      const index = all.findIndex((g) => g.url === url);
      setActiveIndex(index >= 0 ? index : 0);
      setLightboxOpen(true);
    },
    [all]
  );

  const close = useCallback(() => setLightboxOpen(false), []);
  const prev = useCallback(
    () => setActiveIndex((i) => (i - 1 + all.length) % all.length),
    [all.length]
  );
  const next = useCallback(
    () => setActiveIndex((i) => (i + 1) % all.length),
    [all.length]
  );

  // keyboard controls
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, close, prev, next]);

  return (
    <div className="w-full px-4 md:px-8 py-10">
      <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start md:items-stretch">
        {/* LEFT: Hero image + previews */}
        <div className="w-full md:w-[min(860px,60vw)]">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease }}
            className="relative"
            data-aos="zoom-in"
            data-aos-delay="50"
          >
            <img
              onClick={() => openAt(hero.url)}
              className="w-full rounded-2xl shadow-lg border border-white/10 object-cover cursor-zoom-in"
              src={hero.url}
              alt="Rancho de Paloma Blanca two-story Party Deck"
            />
          </motion.div>

          {/* Previews – large & small screens: horizontal row; medium screens: grid */}
          <div className="mt-3">
            {/* md: grid to fill the visual gap; sm & lg: horizontal flex thumbnails */}
            <div className="hidden md:grid grid-cols-3 lg:hidden gap-3">
              {thumbs.slice(0, 6).map((img) => (
                <motion.button
                  key={img.url}
                  className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-white/5"
                  onClick={() => openAt(img.url)}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.4, ease }}
                  data-aos="fade-up"
                >
                  <img
                    src={img.url}
                    alt="Party deck preview"
                    className="w-full h-full object-cover cursor-pointer"
                  />
                </motion.button>
              ))}
            </div>

            <div className="flex md:hidden lg:flex gap-2 overflow-x-auto no-scrollbar py-1">
              {[hero, ...thumbs]
                .filter((v, i, a) => a.findIndex((x) => x.url === v.url) === i)
                .slice(1, 12)
                .map((img) => (
                  <motion.button
                    key={img.url}
                    onClick={() => openAt(img.url)}
                    className="shrink-0 w-28 h-20 rounded-lg overflow-hidden border border-white/10 bg-white/5"
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.35, ease }}
                  >
                    <img
                      src={img.url}
                      alt="Party deck thumbnail"
                      className="w-full h-full object-cover"
                    />
                  </motion.button>
                ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Content */}
        <div className="w-full max-w-2xl">
          <motion.h1
            className="text-3xl md:text-4xl font-gin text-white mb-3"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, ease, delay: 0.05 }}
          >
            Party Deck
          </motion.h1>

          <motion.p
            className="text-neutral-200/90 leading-relaxed mb-5"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, ease, delay: 0.12 }}
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
              transition={{ duration: 0.45, ease, delay: 0.18 }}
              data-aos="fade-up"
              data-aos-delay="150"
            >
              <h3 className="text-white font-medium mb-1">
                Cooking & Refreshments
              </h3>
              <ul className="text-neutral-200/90 text-sm space-y-1.5 list-disc pl-5">
                <li>Full-size grill for post-hunt cookouts</li>
                <li>Two dedicated bars for setup &amp; serving</li>
                <li>Running water on site</li>
              </ul>
            </motion.div>

            <motion.div
              className="rounded-xl border border-white/10 bg-white/5 p-4"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, ease, delay: 0.24 }}
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
              transition={{ duration: 0.45, ease, delay: 0.3 }}
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

      {/* LIGHTBOX */}
      <AnimatePresence>
        {lightboxOpen && all.length > 0 && (
          <motion.div
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <div
              className="absolute inset-0 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.img
                key={activeIndex}
                src={all[activeIndex].url}
                alt="Party Deck full view"
                className="max-h-[85vh] max-w-[92vw] rounded-xl border border-white/10 object-contain"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35, ease }}
              />

              {/* Controls */}
              {all.length > 1 && (
                <>
                  <button
                    onClick={prev}
                    className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-2 text-white"
                    aria-label="Previous image"
                  >
                    ‹
                  </button>
                  <button
                    onClick={next}
                    className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-2 text-white"
                    aria-label="Next image"
                  >
                    ›
                  </button>
                </>
              )}

              <button
                onClick={close}
                className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 px-3 py-2 text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PartyDeck;
