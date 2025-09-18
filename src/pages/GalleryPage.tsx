import { useEffect, useRef, useState } from "react";
import { storage } from "../firebase/firebaseConfig";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import Thumbnail from "../components/Thumbnail";
import { motion, AnimatePresence } from "framer-motion";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

const GalleryPage = () => {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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

  const startSlideshow = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % imageUrls.length);
    }, 5000);
  };

  useEffect(() => {
    if (imageUrls.length === 0) return;
    startSlideshow();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [imageUrls]);

  // 🧠 Pause slideshow when Lightbox is open
  useEffect(() => {
    if (lightboxOpen && intervalRef.current) {
      clearInterval(intervalRef.current);
    } else if (!lightboxOpen && imageUrls.length > 0) {
      startSlideshow();
    }
  }, [lightboxOpen, imageUrls]);

  const handleThumbnailClick = (index: number) => {
    setCurrentIndex(index);
    startSlideshow();
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 md:px-8 bg-[var(--color-dark)] text-[var(--color-text)] max-w-[1400px] mx-auto md:mt-20">
      <h1 className="text-4xl font-gin mb-10 text-[var(--color-accent-gold)]">
        RANCHO DE PALOMA BLANCA
      </h1>

      {/* Desktop View */}
      <div className="hidden md:block">
        {loading ? (
          <p className="text-center text-neutral-300">Loading gallery...</p>
        ) : imageUrls.length === 0 ? (
          <p className="text-center text-neutral-400">No images found.</p>
        ) : (
          <div className="grid lg:grid-cols-4 gap-8">
            {/* Left Column - Main Image */}
            <div className="lg:col-span-3">
              <div className="sticky top-28 overflow-hidden rounded-lg shadow-lg cursor-pointer">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={imageUrls[currentIndex]}
                    src={imageUrls[currentIndex]}
                    onClick={() => setLightboxOpen(true)}
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={{ duration: 0.6 }}
                    alt={`Main image ${currentIndex + 1}`}
                    className="w-full h-[500px] object-cover rounded-lg"
                  />
                </AnimatePresence>
              </div>
            </div>

            {/* Right Column - Thumbnails */}
            <div className="lg:col-span-1 grid grid-cols-2 sm:grid-cols-2 gap-4">
              {imageUrls.map((url, idx) => (
                <Thumbnail
                  key={idx}
                  url={url}
                  index={idx}
                  isActive={currentIndex === idx}
                  onClick={() => handleThumbnailClick(idx)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile View */}
      <div className="block md:hidden">
        {/* Sticky Main Image */}
        <div className="sticky top-0 z-10 bg-[var(--color-dark)] pb-4 pt-10 cursor-pointer">
          <AnimatePresence mode="wait">
            <motion.img
              key={imageUrls[currentIndex]}
              src={imageUrls[currentIndex]}
              onClick={() => setLightboxOpen(true)}
              initial={{ opacity: 0, y: -30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.6 }}
              alt={`Main image mobile ${currentIndex + 1}`}
              className="w-full h-[500px] object-cover rounded-lg shadow-lg"
            />
          </AnimatePresence>
        </div>

        {/* Thumbnails */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          {imageUrls.map((url, idx) => (
            <motion.button
              key={idx}
              onClick={() => handleThumbnailClick(idx)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.03 }}
              className={`overflow-hidden rounded-lg border-2 transition duration-300 ${
                currentIndex === idx
                  ? "border-[var(--color-accent-gold)]"
                  : "border-transparent"
              }`}
            >
              <motion.img
                src={url}
                alt={`Thumb ${idx + 1}`}
                className="w-full h-32 object-cover"
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.3 }}
              />
            </motion.button>
          ))}
        </div>
      </div>

      {/* Lightbox Viewer */}
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
