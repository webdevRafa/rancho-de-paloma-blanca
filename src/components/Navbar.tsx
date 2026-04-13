import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
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
          <div className="hidden items-center md:space-x-2 lg:flex lg:space-x-4 text-xs">
            {navLinks.map((l) => {
              const isActive = isActivePath(l.to);

              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={[
                    " px-3 py-2 text-white transition-all duration-200",
                    "border border-transparent",
                    isActive
                      ? "bg-[var(--color-card)] text-[var(--color-accent-gold)] border-[var(--color-accent-gold)]/40 shadow-[0_0_0_1px_rgba(217,181,106,0.08)]"
                      : "hover:bg-[var(--color-card)]/20 text-white/60 hover:text-white",
                    l.label === "Book a Hunt" && !isActive
                      ? "font-bold"
                      : "font-bold",
                  ].join(" ")}
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
              className="fixed right-0 top-0 z-[100] h-screen w-full overflow-y-auto border-l border-white/10 bg-gradient-to-b from-[var(--color-background)] via-[var(--color-background)]/95 to-[var(--color-background)]/90 backdrop-blur-lg"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={drawerVariants}
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 pb-5">
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
                className="px-5 pt-4 pb-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.25, ease, delay: 0.05 },
                }}
              >
                <div className="flex items-center justify-between gap-3  px-4 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.28)] transition hover:border-[var(--color-accent-gold)]/30">
                  <div className="flex items-center gap-3 min-w-0">
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt="User avatar"
                        className="h-11 w-11 rounded-full border border-white object-cover shrink-0"
                      />
                    ) : (
                      <div className="grid h-11 w-11 place-items-center rounded-full border border-white bg-[var(--color-card)] text-white shrink-0">
                        ?
                      </div>
                    )}

                    <div className="min-w-0 leading-tight text-white">
                      <div className="font-gin truncate">
                        {user?.displayName || user?.email || "Guest"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--color-accent-sage)]">
                        Welcome back to the ranch
                      </div>
                    </div>
                  </div>
                </div>

                {user && (
                  <div className="mt-3">
                    <Link
                      to="/dashboard"
                      onClick={() => setIsOpen(false)}
                      className="block rounded-xl border border-[var(--color-accent-gold)]/35 bg-[var(--color-accent-gold)]/10 px-4 py-3 text-left shadow-[0_6px_20px_rgba(0,0,0,0.22)] transition hover:border-[var(--color-accent-gold)]/55 hover:bg-[var(--color-accent-gold)]/14"
                    >
                      <div className="font-gin text-sm text-[var(--color-accent-gold)]">
                        My Orders
                      </div>
                      <div className="mt-1 text-[11px] text-white/55">
                        View bookings, hunts, and history
                      </div>
                    </Link>
                  </div>
                )}
              </motion.div>

              {/* Links (staggered) */}
              <motion.ul
                className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pt-2 pb-4 text-white"
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
                        className={[
                          "block rounded-lg border px-4 py-3 font-gin text-sm transition-all duration-200",
                          isActive
                            ? "border-[var(--color-accent-gold)]/40 bg-[var(--color-accent-gold)]/10 text-[var(--color-accent-gold)]"
                            : "border-white/10 bg-[var(--color-card)]/70 text-white shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-[var(--color-accent-gold)]/40 hover:bg-[var(--color-card-hover)] hover:text-[var(--color-accent-gold)]",
                        ].join(" ")}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {l.label}
                      </NavLink>
                    </motion.li>
                  );
                })}
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
                    className="w-full rounded-xl border border-white/10 bg-[var(--color-card)]/80 px-4 py-3 text-left font-gin text-white/70 transition hover:border-red-400/35 hover:text-red-300 hover:bg-[var(--color-card-hover)]"
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
