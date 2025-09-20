import { useEffect, useState } from "react";
import image1 from "../assets/images/group.webp";
import image2 from "../assets/images/IMG_20250919_225159.webp";
import image3 from "../assets/images/IMG_20250919_225210.webp";
import image4 from "../assets/images/IMG_20250919_225208.webp";
import image5 from "../assets/images/IMG_20250919_225201.webp";

const Photos = () => {
  const images = [image1, image2, image3, image4, image5];

  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState<number>(0);

  const open = (i: number) => {
    setIndex(i);
    setIsOpen(true);
  };
  const close = () => setIsOpen(false);
  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  // Keyboard controls: Esc, ←, →
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <>
      {/* Mobile: horizontal scroll strip (snap) ; Desktop: grid */}
      <div className="w-full">
        {/* Mobile / tablet */}
        <div className="flex md:hidden gap-4 overflow-x-auto snap-x snap-mandatory px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => open(i)}
              className="flex-none w-[80vw] max-w-[520px] aspect-[16/10] snap-start overflow-hidden rounded-xl border border-white/10"
              aria-label={`Open photo ${i + 1}`}
            >
              <img
                src={src}
                alt={`Photo ${i + 1}`}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                loading="lazy"
              />
            </button>
          ))}
        </div>

        {/* Desktop */}
        <div className="hidden md:grid md:grid-cols-5 gap-4">
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => open(i)}
              className="group relative h-40 overflow-hidden rounded-xl border border-white/10"
              aria-label={`Open photo ${i + 1}`}
            >
              <img
                src={src}
                alt={`Photo ${i + 1}`}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center"
          onClick={close}
        >
          <div
            className="relative max-w-6xl w-[92vw] md:w-[80vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={images[index]}
              alt={`Photo ${index + 1} enlarged`}
              className="w-full h-auto max-h-[82vh] object-contain rounded-xl shadow-2xl"
            />

            {/* Controls */}
            <button
              onClick={close}
              className="absolute -top-3 -right-3 md:top-3 md:right-3 rounded-full bg-white/10 hover:bg-white/20 p-3 text-white"
              aria-label="Close"
            >
              ✕
            </button>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-3 text-white"
              aria-label="Previous photo"
            >
              ‹
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-3 text-white"
              aria-label="Next photo"
            >
              ›
            </button>

            {/* Index indicator */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/80">
              {index + 1} / {images.length}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Photos;
