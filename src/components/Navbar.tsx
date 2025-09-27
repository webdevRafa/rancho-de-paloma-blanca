import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "../assets/logo-official.webp";
import { useAuth } from "../context/AuthContext";
import AuthModal from "./AuthModal";

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

  const navLinks = useMemo(
    () => [
      { to: "/", label: "Home" },
      { to: "/book", label: "Book a Hunt" },
      { to: "/rules", label: "Property Rules" },
      { to: "/merch", label: "Merch" },
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
          "fixed top-0 left-0 z-30 w-full transition-all duration-300",
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
          <div className="hidden items-center md:space-x-2 lg:flex lg:space-x-4 text-xs">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={[
                  "rounded-sm p-2 text-white transition",
                  "hover:bg-[var(--color-background)]/40",
                  l.label === "Book a Hunt" ? "font-bold" : "",
                ].join(" ")}
              >
                {l.label}
              </Link>
            ))}

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
                  className="ml-2 h-10 w-10 overflow-hidden rounded-full border border-white transition hover:opacity-80"
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
              className="fixed inset-0 z-40 bg-black"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={overlayVariants}
              onClick={() => setIsOpen(false)}
              aria-label="Close menu overlay"
            />
            <motion.aside
              className="fixed right-0 top-0 z-50 h-screen w-full overflow-y-auto border-l border-white/10 bg-gradient-to-b from-[var(--color-background)] to-transparent backdrop-blur-md"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={drawerVariants}
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2 text-white">
                  <img src={logo} alt="" className="h-9 w-9" />
                  <p className="font-gin text-white">Rancho de Paloma Blanca</p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-md p-1 text-white/90 hover:text-white"
                  aria-label="Close menu"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* User block */}
              <motion.div
                className="flex items-center gap-3 px-5 py-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.25, ease, delay: 0.05 },
                }}
              >
                <Link
                  to="/dashboard"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-[var(--color-card)]/70 px-3 py-2"
                >
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="User avatar"
                      className="h-10 w-10 rounded-full border border-white object-cover"
                    />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full border border-white bg-[var(--color-card)] text-white">
                      ?
                    </div>
                  )}
                  <div className="leading-tight text-white">
                    <div className="font-gin">
                      {user?.displayName || user?.email || "Guest"}
                    </div>
                    <div className="text-xs text-[var(--color-accent-sage)]">
                      Dashboard
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* Links (staggered) */}
              <motion.ul
                className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-white"
                initial="hidden"
                animate="visible"
                variants={listVariants}
              >
                {navLinks.map((l) => (
                  <motion.li key={l.to} variants={itemVariants}>
                    <Link
                      to={l.to}
                      onClick={() => setIsOpen(false)}
                      className="block rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-gin text-sm transition hover:border-white/30"
                    >
                      {l.label}
                    </Link>
                  </motion.li>
                ))}
              </motion.ul>

              {/* Actions */}
              <div className="px-5 py-6">
                {user ? (
                  <motion.button
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    onClick={() => {
                      logout();
                      setIsOpen(false);
                    }}
                    className="w-full rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-left font-gin text-red-300 transition hover:bg-red-400/15"
                  >
                    Sign Out
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
                    className="w-full rounded-lg border border-[var(--color-accent-gold)]/40 bg-[var(--color-accent-gold)]/10 px-4 py-2.5 text-left font-gin text-[var(--color-accent-gold)] transition hover:bg-[var(--color-accent-gold)]/15"
                  >
                    Login / Signup
                  </motion.button>
                )}
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
