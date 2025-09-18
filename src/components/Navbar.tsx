import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import logo from "../assets/logo-official.webp";
import { useAuth } from "../context/AuthContext";
import AuthModal from "./AuthModal";

const Navbar = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (!isOpen && currentScrollY > lastScrollY && currentScrollY > 80) {
        setShowNav(false);
      } else {
        setShowNav(true);
      }
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
    { to: "/videos", label: "Videos" },
    { to: "/contact", label: "Contact" },
    { to: "/about", label: "About Us" },
    { to: "/sponsor", label: "Our Sponsor" },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <nav
        className={`fixed top-0 left-0 w-full text-[var(--color-text)] z-30 transform transition-all duration-300 ${
          showNav ? "translate-y-0" : "-translate-y-full"
        } ${
          scrolled ? "bg-[var(--color-footer)] shadow-md" : "bg-transparent"
        }`}
      >
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3">
            <img
              src={logo}
              alt="Rancho Logo"
              className="h-10 w-10 rounded-full"
            />
            <span className=" text-md text-white font-gin">
              Rancho de Paloma Blanca
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex md:space-x-2 lg:space-x-4 md:text-xs text-sm items-center">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`hover:bg-[var(--color-background)]/40 rounded-sm p-2 transition text-white ${
                  link.label === "Book a Hunt" && "font-bold"
                }`}
              >
                {link.label}
              </Link>
            ))}

            {!user ? (
              <button
                onClick={() => setAuthOpen(true)}
                className="text-white hover:text-[var(--color-accent-gold)] font-semibold text-sm"
              >
                Login / Signup
              </button>
            ) : (
              <Link
                to="/dashboard"
                className="ml-2 rounded-full overflow-hidden w-10 h-10 border border-white hover:opacity-80 transition"
                title="Dashboard"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="User avatar"
                    className="object-cover w-full h-full rounded-full"
                  />
                ) : (
                  <span className="text-white text-sm font-bold flex items-center justify-center h-full w-full">
                    DB
                  </span>
                )}
              </Link>
            )}
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

      {/* Mobile Drawer */}
      <div
        className={`fixed top-0 right-0 h-screen w-80 bg-gradient-to-r  from-[var(--color-background)] to-[var(--color-footer)] shadow-xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-background)]">
          <div className="flex items-center gap-2 text-white">
            <img className="w-10" src={logo} alt="Rancho logo" />
            <p className="text-md font-gin text-white">
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

        {/* User Info → now wrapped in Link to Dashboard */}
        <Link
          to="/dashboard"
          onClick={() => setIsOpen(false)}
          className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-background)] hover:bg-[var(--color-card)] transition"
        >
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt="User avatar"
              className="w-10 h-10 rounded-full object-cover border border-white"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[var(--color-card)] border border-white flex items-center justify-center text-white font-bold">
              ?
            </div>
          )}
          <div className="text-white text-sm leading-tight">
            {user?.displayName || user?.email || "Guest"}
            <div className="text-xs text-[var(--color-accent-sage)]">
              Dashboard
            </div>
          </div>
        </Link>

        {/* Nav Links */}
        <div className="flex flex-col flex-grow px-6 py-6 space-y-4 text-md text-[var(--color-text)]">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setIsOpen(false)}
              className="hover:text-[var(--color-button-hover)] transition font-acumin text-lg"
            >
              {link.label}
            </Link>
          ))}

          <div className="mt-6 border-t border-[var(--color-background)] pt-4 flex flex-col space-y-2 text-sm">
            {user ? (
              <button
                onClick={() => {
                  logout();
                  setIsOpen(false);
                }}
                className="text-left text-red-400 hover:text-red-500"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={() => {
                  setAuthOpen(true);
                  setIsOpen(false);
                }}
                className="text-left text-[var(--color-accent-gold)] hover:underline"
              >
                Login / Signup
              </button>
            )}
          </div>
        </div>
      </div>
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
};

export default Navbar;
