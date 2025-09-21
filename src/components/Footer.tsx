import { FaFacebookF, FaInstagram } from "react-icons/fa";
import { Link } from "react-router-dom";
const Footer = () => {
  return (
    <footer className="w-full py-20 bg-gradient-to-r from-[var(--color-dark)] via-[var(--color-footer)] to-[var(--color-dark)] mt-20">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand / Copyright */}
        <p
          data-aos="fade-up"
          className="text-sm text-center md:text-left text-white opacity-60"
        >
          © {new Date().getFullYear()} Rancho de Paloma Blanca. All rights
          reserved.
        </p>
        <Link
          data-aos="fade-up"
          className="text-[var(--color-accent-gold)] text-sm mb-3 md:mb-0 relative z-40"
          to="/refunds"
        >
          Refund Policy
        </Link>
        {/* Social Links */}
        <div className="flex space-x-6 text-white z-40">
          {/* Facebook */}
          <a
            data-aos="fade-up"
            href="https://www.facebook.com/share/16fMa3w3iP/?mibextid=wwXlfr"
            target="_blank"
            aria-label="Facebook"
            className="transition transform hover:scale-110 hover:opacity-80"
          >
            <FaFacebookF size={22} />
          </a>

          {/* Instagram */}
          <a
            data-aos="fade-up"
            href="https://www.instagram.com/ranchodepalomablanca"
            target="_blank"
            aria-label="Instagram"
            className="transition transform hover:scale-110 hover:opacity-80"
          >
            <FaInstagram size={22} />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
