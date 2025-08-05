// /components/Thumbnail.tsx
import { useEffect, useRef, useState } from "react";

interface Props {
  url: string;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

const Thumbnail: React.FC<Props> = ({ url, index, isActive, onClick }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.15 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 transform ${
        inView ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
      }`}
    >
      <button
        onClick={onClick}
        className={`overflow-hidden w-full rounded-lg border-2 transition-transform duration-300 hover:scale-105 ${
          isActive ? "border-[var(--color-accent-gold)]" : "border-transparent"
        }`}
      >
        <img
          src={url}
          alt={`Thumbnail ${index + 1}`}
          className="w-full h-32 object-cover"
        />
      </button>
    </div>
  );
};

export default Thumbnail;
