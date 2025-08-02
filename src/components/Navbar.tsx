import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import logo from "../assets/rdp-white.svg";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Hide nav on fast downward scroll (only when menu closed)
      if (!isOpen && currentScrollY > lastScrollY && currentScrollY > 80) {
        setShowNav(false);
      } else {
        setShowNav(true);
      }

      // Change background color when scrolled past 50px
      setScrolled(currentScrollY > 50);

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY, isOpen]);

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/book", label: "Book a Hunt" },
    { to: "/rules", label: "Property Rules" },
    { to: "/merch", label: "Merchandise" },
    { to: "/gallery", label: "Gallery" },
    { to: "/contact", label: "Contact" },
    { to: "/about", label: "About Us" },
    { to: "/sponsor", label: "Our Sponsor" },
  ];

  return (
    <>
      {/* Backdrop Blur for mobile menu */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Navbar */}
      <nav
        className={`fixed top-0 left-0 w-full text-[var(--color-text)] z-30 transform transition-all duration-300 ${
          showNav ? "translate-y-0" : "-translate-y-full"
        } ${scrolled ? "bg-[var(--color-card)] shadow-md" : "bg-transparent"} ${
          !scrolled ? "" : ""
        }`}
      >
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3">
            <img
              src={logo}
              alt="Rancho Logo"
              className="h-10 w-10 rounded-full"
            />
            <span className="broadsheet text-md text-white">
              Rancho de Paloma Blanca
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex md:space-x-2 lg:space-x-4 text-sm ">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="hover:bg-[var(--color-background)]/40  rounded-sm p-2 transition text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Mobile Hamburger */}
          <button
            className="lg:hidden focus:outline-none text-white"
            onClick={toggleMenu}
            aria-label="Toggle Menu"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Side Drawer */}
      <div
        className={`fixed top-0 right-0 h-screen w-80 bg-gradient-to-r from-[var(--color-background)] to-[var(--color-footer)] shadow-xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-background)]">
          <div className="flex items-center gap-2 text-white">
            <img className="w-10" src={logo} alt="Rancho logo" />
            <p className="text-lg font-broadsheet text-white">
              Rancho de Paloma Blanca
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-[var(--color-text)] hover:text-[var(--color-button-hover)]"
            aria-label="Close Menu"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Nav Links */}
        <div className="flex flex-col flex-grow px-6 py-6 space-y-6 text-md text-[var(--color-text)]">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setIsOpen(false)}
              className="hover:text-[var(--color-button-hover)] transition font-broadsheet text-lg"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
};

export default Navbar;
