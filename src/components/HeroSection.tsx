import { useEffect, useState } from "react";

const HeroSection = () => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setOffset(window.scrollY * 0.4);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section className="relative text-[var(--color-text)] h-[600px]  flex items-center justify-center overflow-hidden">
      {/* Background Videos */}
      <div
        data-aos="fade-in"
        data-aos-delay="1500"
        data-aos-duration="1000"
        className="absolute w-[90%] mx-auto inset-0 overflow-hidden"
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
    </section>
  );
};

export default HeroSection;
