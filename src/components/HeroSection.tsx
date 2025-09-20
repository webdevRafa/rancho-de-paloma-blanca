import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react"; // <-- Import icon

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
      <div
        data-aos="fade-in"
        data-aos-delay="1500"
        data-aos-duration="1000"
        className="absolute inset-0 overflow-hidden"
      >
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

      <div data-aos="zoom-in-up" className="py-10 text-center ">
        <h2
          id="info"
          className="text-2xl mb-2 text-white pt-10 font-gin uppercase"
        >
          Brownsville’s Premier Dove Hunting Destination
        </h2>
        <p className="text-md max-w-3xl mx-auto mb-10 px-10">
          Rooted in South Texas tradition, Rancho de Paloma Blanca brings
          hunters to Brownsville for unmatched dove hunting and authentic ranch
          hospitality.
        </p>
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
