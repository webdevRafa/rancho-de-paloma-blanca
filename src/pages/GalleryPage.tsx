import { useEffect, useRef, useState } from "react";
import { storage } from "../firebase/firebaseConfig";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import Thumbnail from "../components/Thumbnail";
import { motion, AnimatePresence } from "framer-motion";

const GalleryPage = () => {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null); // 👈 track slideshow interval

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

  // Set interval when images load
  useEffect(() => {
    if (imageUrls.length === 0) return;
    startSlideshow();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [imageUrls]);

  // 👉 reset slideshow when user manually clicks a thumbnail
  const handleThumbnailClick = (index: number) => {
    setCurrentIndex(index);
    startSlideshow(); // ⏱ reset slideshow timer
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 md:px-8 bg-[var(--color-dark)] text-[var(--color-text)] max-w-[1400px] mx-auto">
      <h1 className="text-center text-4xl font-broadsheet mb-10 text-[var(--color-accent-gold)]">
        Photo Gallery
      </h1>

      {loading ? (
        <p className="text-center text-neutral-300">Loading gallery...</p>
      ) : imageUrls.length === 0 ? (
        <p className="text-center text-neutral-400">No images found.</p>
      ) : (
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Left Column - Main Image */}
          <div className="lg:col-span-3">
            <div className="sticky top-28 overflow-hidden rounded-lg shadow-lg">
              <AnimatePresence mode="wait">
                <motion.img
                  key={imageUrls[currentIndex]}
                  src={imageUrls[currentIndex]}
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
  );
};

export default GalleryPage;
