import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import logo from "../assets/rdp-white.svg";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (!isOpen && currentScrollY > lastScrollY && currentScrollY > 80) {
        setShowNav(false);
      } else {
        setShowNav(true);
      }

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
  ];

  return (
    <>
      {/* Backdrop Blur (covers navbar + content) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Navbar */}
      <nav
        className={`fixed top-0 left-0 w-full bg-[var(--color-card)] text-[var(--color-text)] shadow-md z-30 transform transition-transform duration-300 ${
          showNav ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3">
            <img
              src={logo}
              alt="Rancho Logo"
              className="h-10 w-10 rounded-full"
            />
            <span className="text-xl">Rancho de Paloma Blanca</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex space-x-6 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="hover:text-[var(--color-accent-gold)] transition"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden focus:outline-none"
            onClick={toggleMenu}
            aria-label="Toggle Menu"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Side Drawer (moved out of nav, always above backdrop) */}
      <div
        className={`fixed top-0 right-0 h-screen w-80 bg-[var(--color-card)] shadow-xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header with Close Button */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-background)]">
          <div className="flex items-center gap-2 text-white">
            <img className="w-10" src={logo} alt="Rancho logo" />
            <p className="text-sm font-semibold">Rancho de Paloma Blanca</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-[var(--color-text)] hover:text-[var(--color-accent-gold)]"
            aria-label="Close Menu"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Nav Links */}
        <div className="flex flex-col flex-grow px-6 py-6 space-y-6 text-md text-neutral-300">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setIsOpen(false)}
              className="hover:text-[var(--color-accent-gold)] transition"
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
