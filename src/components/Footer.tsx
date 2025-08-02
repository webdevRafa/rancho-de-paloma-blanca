import { FaFacebookF, FaInstagram } from "react-icons/fa";

const Footer = () => {
  return (
    <footer
      className="w-full py-20"
      style={{
        backgroundColor: "var(--color-footer)",
        color: "var(--color-text)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand / Copyright */}
        <p className="text-sm text-center md:text-left">
          © {new Date().getFullYear()} Rancho de Paloma Blanca. All rights
          reserved.
        </p>

        {/* Social Links */}
        <div className="flex space-x-6">
          {/* Facebook */}
          <a
            href="https://www.facebook.com/share/16fMa3w3iP/?mibextid=wwXlfr"
            target="_blank"
            aria-label="Facebook"
            className="transition transform hover:scale-110 hover:opacity-80"
          >
            <FaFacebookF size={22} />
          </a>

          {/* Instagram */}
          <a
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
