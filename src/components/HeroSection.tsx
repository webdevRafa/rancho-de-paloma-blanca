import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react"; // <-- Import icon
import logo from "../assets/logo-official.webp";

const HeroSection = () => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setOffset(window.scrollY * 0.4);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  // Scroll function
  const scrollToInfo = () => {
    const target = document.getElementById("info");
    if (!target) return;

    const targetPosition = target.getBoundingClientRect().top + window.scrollY;
    const startPosition = window.scrollY;
    const distance = targetPosition - startPosition;
    const duration = 1000; // time in ms (1 second for slower scroll)
    let startTime: number | null = null;

    const animation = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const run = easeInOutQuad(timeElapsed, startPosition, distance, duration);
      window.scrollTo(0, run);
      if (timeElapsed < duration) requestAnimationFrame(animation);
    };

    const easeInOutQuad = (t: number, b: number, c: number, d: number) => {
      t /= d / 2;
      if (t < 1) return (c / 2) * t * t + b;
      t--;
      return (-c / 2) * (t * (t - 2) - 1) + b;
    };

    requestAnimationFrame(animation);
  };
  return (
    <section className="relative text-[var(--color-text)] min-h-[100vh] flex items-center justify-center overflow-hidden">
      {/* Background Videos */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Desktop Horizontal Video */}
        <video
          className="hidden md:block w-full h-full object-cover opacity-50"
          src="https://player.vimeo.com/progressive_redirect/playback/1105805752/rendition/1080p/file.mp4?loc=external&signature=6a79087644a3a7a8e3ef3c4f08b3b029efb9734bcbc96a9a6a4a6a7617ccbc83"
          autoPlay
          muted
          loop
          playsInline
        >
          Your browser does not support the video tag.
        </video>

        {/* Mobile Vertical Video */}
        <video
          className="block md:hidden w-full h-full object-cover opacity-50"
          src="https://player.vimeo.com/progressive_redirect/playback/1105805801/rendition/1080p/file.mp4?loc=external&signature=8656f7dfb525f7a636460887e9ea23581a3ece9add465861ff66f4af11a52ed1"
          autoPlay
          muted
          loop
          playsInline
        >
          Your browser does not support the video tag.
        </video>

        {/* Overlay */}
        <div
          className="absolute inset-0 bg-opacity-50"
          style={{ transform: `translateY(${offset * 0.5}px)` }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-6">
        <img className="w-30 mx-auto" src={logo} alt="" />
        <h1 className="font-light text-2xl md:text-4xl text-white mb-0">
          Welcome to Rancho de Paloma Blanca
        </h1>
        <p className="text-xs md:text-md max-w-2xl mx-auto mb-6">
          Experience premium guided hunts and the beauty of Texas outdoors.
        </p>
        <a
          href="/book"
          className="inline-block hero-btn px-4 text-white font-light! border-2 border-[var(--color-button-hover)] py-2 bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-lg md:text-xl rounded-md transition duration-300 ease-in-out"
        >
          Book Your Hunt
        </a>
      </div>

      {/* Scroll Down Icon */}
      <div
        onClick={scrollToInfo}
        className="absolute bottom-5 flex justify-center w-full animate-bounce cursor-pointer"
      >
        <ChevronDown size={40} className="text-white opacity-80" />
      </div>
    </section>
  );
};

export default HeroSection;
