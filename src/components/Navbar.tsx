import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowRight, LogOut, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "../assets/logo-official.webp";
import { useAuth } from "../context/AuthContext";
import AuthModal from "./AuthModal";
import "./Navbar.css";

const ease = [0.16, 1, 0.3, 1] as const;

const drawerVariants = {
  hidden: { x: "100%" },
  visible: { x: 0, transition: { duration: 0.38, ease } },
  exit: { x: "100%", transition: { duration: 0.28, ease } },
};

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 0.5, transition: { duration: 0.25, ease } },
  exit: { opacity: 0, transition: { duration: 0.2, ease } },
};

const listVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease } },
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const [showNav, setShowNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  const location = useLocation();
  const isActivePath = (to: string) => {
    if (to === "/") return location.pathname === "/";
    return location.pathname === to;
  };
  const navLinks = useMemo(
    () => [
      { to: "/", label: "Home" },
      { to: "/book", label: "Book a Hunt" },
      { to: "/rules", label: "Property Rules" },

      { to: "/gallery", label: "Gallery" },
      { to: "/videos", label: "Videos" },
      { to: "/contact", label: "Contact" },
      { to: "/about", label: "About Us" },
      { to: "/sponsor", label: "Our Sponsor" },
    ],
    []
  );

  // Hide-on-scroll & scrolled background
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (!isOpen && y > lastScrollY && y > 80) setShowNav(false);
      else setShowNav(true);
      setScrolled(y > 50);
      setLastScrollY(y);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [lastScrollY, isOpen]);

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Body scroll lock while drawer open
  useEffect(() => {
    const body = document.body;
    if (isOpen) {
      const prev = body.style.overflow;
      body.style.overflow = "hidden";
      return () => {
        body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <>
      {/* Top bar */}
      <nav
        className={[
          "fixed top-0 left-0 z-40 w-full transition-all duration-300",
          showNav ? "translate-y-0" : "-translate-y-full",
          scrolled ? "bg-[var(--color-footer)] shadow-md" : "bg-transparent",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 text-[var(--color-text)]">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={logo}
              alt="Rancho logo"
              className="h-10 w-10 rounded-full"
            />
            <span className="font-gin text-white">Rancho de Paloma Blanca</span>
          </Link>

          {/* Desktop nav */}
          <div className="desktop-nav hidden items-center lg:flex text-xs">
            {navLinks.map((l) => {
              const isActive = isActivePath(l.to);

              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={`desktop-nav__link${
                    isActive ? " desktop-nav__link--active" : ""
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {l.label}
                </NavLink>
              );
            })}

            {!user ? (
              <button
                onClick={() => setAuthOpen(true)}
                className="text-sm font-semibold text-white hover:text-[var(--color-accent-gold)]"
              >
                Login / Signup
              </button>
            ) : (
              <>
                <Link
                  to="/dashboard"
                  title="Dashboard"
                  className={[
                    "ml-2 h-10 w-10 overflow-hidden rounded-full border transition hover:opacity-80",
                    location.pathname === "/dashboard"
                      ? "border-[var(--color-accent-gold)] shadow-[0_0_0_2px_rgba(217,181,106,0.18)]"
                      : "border-white",
                  ].join(" ")}
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="User avatar"
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                      DB
                    </span>
                  )}
                </Link>

                {/* Desktop sign out */}
                <button
                  onClick={logout}
                  className="ml-3 hidden items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs text-white/90 transition hover:border-red-400 hover:text-red-400 lg:inline-flex"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="font-acumin text-white">Sign Out</span>
                </button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="text-white lg:hidden"
            onClick={() => setIsOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer + overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.button
              className="fixed inset-0 z-[90] bg-black"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={overlayVariants}
              onClick={() => setIsOpen(false)}
              aria-label="Close menu overlay"
            />
            <motion.aside
              className="mobile-menu fixed right-0 top-0 z-[100] h-screen overflow-y-auto"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={drawerVariants}
            >
              <header className="mobile-menu__header">
                <Link
                  to="/"
                  className="mobile-menu__brand"
                  onClick={() => setIsOpen(false)}
                >
                  <img src={logo} alt="" />
                  <span>
                    <strong>Rancho de Paloma Blanca</strong>
                    <small>Brownsville, Texas</small>
                  </span>
                </Link>
                <button
                  onClick={() => setIsOpen(false)}
                  className="mobile-menu__close"
                  aria-label="Close menu"
                >
                  <X />
                </button>
              </header>

              <div className="mobile-menu__content">
                <motion.section
                className="mobile-menu__account"
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.25, ease, delay: 0.05 },
                }}
                aria-label="Account"
              >
                <div className="mobile-menu__profile">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="User avatar" />
                  ) : (
                    <span className="mobile-menu__avatar-fallback" aria-hidden="true">
                      {user?.displayName?.charAt(0) || user?.email?.charAt(0) || "R"}
                    </span>
                  )}

                  <div className="mobile-menu__profile-copy">
                    <span>{user ? "Your ranch account" : "Welcome to the ranch"}</span>
                    <strong>{user?.displayName || user?.email || "Guest"}</strong>
                    <small>
                      {user
                        ? "Bookings and account details"
                        : "Sign in to manage your hunt"}
                    </small>
                  </div>
                </div>

                {user && (
                  <Link
                    to="/dashboard"
                    onClick={() => setIsOpen(false)}
                    className="mobile-menu__orders"
                  >
                    <span>
                      <strong>My orders</strong>
                      <small>View bookings, hunts, and history</small>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </Link>
                )}
              </motion.section>

              <div className="mobile-menu__section-label">
                <span>Explore</span>
                <small>Rancho de Paloma Blanca</small>
              </div>

              <motion.ul
                className="mobile-menu__links"
                initial="hidden"
                animate="visible"
                variants={listVariants}
              >
                {navLinks.map((l) => {
                  const isActive = isActivePath(l.to);

                  return (
                    <motion.li key={l.to} variants={itemVariants}>
                      <NavLink
                        to={l.to}
                        onClick={() => setIsOpen(false)}
                        className={`mobile-menu__link${
                          isActive ? " mobile-menu__link--active" : ""
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span>{l.label}</span>
                        <ArrowRight aria-hidden="true" />
                      </NavLink>
                    </motion.li>
                  );
                })}
              </motion.ul>

              <div className="mobile-menu__footer">
                {user ? (
                  <motion.button
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    onClick={() => {
                      logout();
                      setIsOpen(false);
                    }}
                    className="mobile-menu__session-action mobile-menu__session-action--signout"
                  >
                    <span>Sign out</span>
                    <LogOut aria-hidden="true" />
                  </motion.button>
                ) : (
                  <motion.button
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    onClick={() => {
                      setAuthOpen(true);
                      setIsOpen(false);
                    }}
                    className="mobile-menu__session-action"
                  >
                    <span>Sign in or create account</span>
                    <ArrowRight aria-hidden="true" />
                  </motion.button>
                )}

                <p>Rancho de Paloma Blanca · Brownsville, Texas</p>
              </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Auth modal */}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
