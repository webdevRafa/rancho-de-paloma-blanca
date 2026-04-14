import { useEffect, useMemo, useState } from "react";
import { storage } from "../firebase/firebaseConfig";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { motion } from "framer-motion";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

const GalleryPage = () => {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(12);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const fetchImages = async () => {
      const folderRef = ref(storage, "gallery");

      try {
        const res = await listAll(folderRef);
        const urls = await Promise.all(
          res.items.map((itemRef) => getDownloadURL(itemRef))
        );

        setImageUrls(urls);
      } catch (err) {
        console.error("Error fetching gallery images:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchImages();
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleOpenLightbox = (index: number) => {
    setCurrentIndex(index);
    setLightboxOpen(true);
  };

  const getTileSpanClass = (index: number) => {
    const pattern = [
      "col-span-1 row-span-2 md:col-span-1 md:row-span-2",
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1",
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1",
      "col-span-1 row-span-1 md:col-span-1 md:row-span-2",
      "col-span-2 row-span-2 md:col-span-2 md:row-span-2",
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1",
      "col-span-2 row-span-1 md:col-span-2 md:row-span-1",
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1",
      "col-span-1 row-span-2 md:col-span-1 md:row-span-2",
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1",
      "col-span-2 row-span-1 md:col-span-2 md:row-span-1",
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1",
    ];

    return pattern[index % pattern.length];
  };

  const getTileRevealDelay = (index: number) => {
    const desktopPattern = [0, 0.05, 0.1, 0.15, 0.08, 0.13, 0.18, 0.1];
    return desktopPattern[index % desktopPattern.length];
  };

  const isPriorityImage = (index: number) => {
    if (isMobile) return index < 2;
    return index < 4;
  };
  const visibleImages = useMemo(() => {
    return isMobile ? imageUrls.slice(0, mobileVisibleCount) : imageUrls;
  }, [imageUrls, isMobile, mobileVisibleCount]);

  const hasMoreMobileImages = isMobile && mobileVisibleCount < imageUrls.length;

  const handleLoadMoreMobile = () => {
    setMobileVisibleCount((prev) => prev + 8);
  };

  return (
    <div className="min-h-screen bg-[var(--color-dark)] text-[var(--color-text)] pt-24 pb-16 md:pt-32 max-w-7xl mx-auto">
      <div className="w-full px-4 md:px-8 xl:px-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10 md:mb-14"
        >
          <p className="mb-3 text-xs md:text-sm uppercase tracking-[0.35em] text-[var(--color-accent-gold)]/75">
            The Experience
          </p>

          <h1 className="font-gin text-3xl sm:text-4xl md:text-5xl text-[var(--color-accent-gold)]">
            Life at Rancho de Paloma Blanca
          </h1>

          <p className="mt-2 max-w-3xl text-sm md:text-base leading-7 text-[var(--color-text)]/75">
            From sunrise flights to time spent in the field, explore what a hunt
            at Rancho de Paloma Blanca really feels like—authentic,
            unforgettable, and built around the South Texas outdoors.
          </p>
        </motion.div>

        {loading ? (
          <div className="py-24 text-center text-[var(--color-text)]/70">
            Loading gallery...
          </div>
        ) : imageUrls.length === 0 ? (
          <div className="py-24 text-center text-[var(--color-text)]/60">
            No images found.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[150px] md:auto-rows-[170px] gap-3 md:gap-5 grid-flow-row-dense">
              {visibleImages.map((url, idx) => (
                <motion.button
                  key={url}
                  type="button"
                  onClick={() => handleOpenLightbox(idx)}
                  initial={{ opacity: 0, y: 28, scale: 0.985 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.18 }}
                  transition={{
                    duration: 0.65,
                    delay: getTileRevealDelay(idx),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  whileHover={{ y: -4 }}
                  className={`group relative overflow-hidden bg-[var(--color-card)] shadow-[0_12px_40px_rgba(0,0,0,0.28)] cursor-pointer text-left will-change-transform ${getTileSpanClass(
                    idx
                  )}`}
                >
                  <img
                    src={url}
                    alt={`Gallery image ${idx + 1}`}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                    loading={isPriorityImage(idx) ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={isPriorityImage(idx) ? "high" : "auto"}
                  />

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-70 transition duration-300 group-hover:opacity-90" />

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 md:p-5">
                    <div className="rounded-full border border-white/20 bg-black/25 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      View
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>

            {hasMoreMobileImages && (
              <div className="mt-8 flex justify-center md:hidden">
                <motion.button
                  type="button"
                  onClick={handleLoadMoreMobile}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center justify-center rounded-full border border-[var(--color-accent-gold)]/30 bg-[var(--color-card)] px-5 py-3 text-sm font-medium text-[var(--color-text)] shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition hover:border-[var(--color-accent-gold)]/50 hover:bg-[var(--color-accent-gold)]/10"
                >
                  Load More Photos
                </motion.button>
              </div>
            )}
          </>
        )}
      </div>

      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={currentIndex}
        slides={imageUrls.map((src) => ({ src }))}
        animation={{ fade: 0.5 }}
      />
    </div>
  );
};

export default GalleryPage;
