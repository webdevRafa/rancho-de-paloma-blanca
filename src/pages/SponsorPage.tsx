import { Link } from "react-router-dom";
import sponsor from "../assets/sponsor.svg";

const SponsorPage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-r from-[var(--color-dark)] via-[var(--color-card)] to-[var(--color-dark)]  text-[var(--color-text)] mt-30 px-6 py-16 text-center">
      <h1 className="text-4xl md:text-5xl  mb-6">
        Seasoned to Perfection — Thanks to Our Sponsor
      </h1>
      <img
        data-aos="zoom-in"
        data-aos-delay="300"
        data-aos-duration="800"
        className="max-w-[300px]"
        src={sponsor}
        alt=""
      />
      <p
        data-aos="fade-up"
        data-aos-delay="1000"
        data-aos-duration="800"
        className="text-lg max-w-2xl my-6"
      >
        We’re proud to recognize{" "}
        <span className="text-white">2 Gringos Chupacabra</span> as the official
        seasoning of Rancho de Paloma Blanca. Their legendary blends bring bold
        flavor to every meal at the ranch, and we’re thrilled to have them as a
        partner.
      </p>

      <a
        data-aos="fade-right"
        data-aos-delay="1600"
        data-aos-duration="800"
        href="https://www.2gringoschupacabra.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block bg-[#047e41] text-[var(--color-background)] font-semibold px-6 py-3 rounded-lg shadow-lg hover:scale-105 transition-transform duration-300 text-sm"
      >
        Visit 2 Gringos Chupacabra
      </a>

      <Link
        to="/"
        className="mt-8 text-[var(--color-text)] text-sm hover:underline "
      >
        ← Back to Home
      </Link>
    </div>
  );
};

export default SponsorPage;
