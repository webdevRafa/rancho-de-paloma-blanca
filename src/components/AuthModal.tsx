import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import googleCont from "../assets/cont-w-google.png";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal = ({ isOpen, onClose }: Props) => {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const {
    loginWithGoogle,
    emailLogin,
    emailSignup,
    authError,
    loading,
    resetPassword,
    setAuthError,
  } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "login") {
      await emailLogin(email, password);
    } else {
      await emailSignup(email, password);
    }
  };

  const handleGoogle = async () => {
    await loginWithGoogle();
    onClose();
  };
  const handleClose = () => {
    setEmail("");
    setPassword("");
    setTab("login");
    onClose();
    setAuthError(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-[var(--color-card)] max-w-md w-full rounded-lg shadow-lg p-6 text-[var(--color-text)] relative"
          >
            {/* Close Button */}
            <button
              className="absolute top-2 right-3 text-[var(--color-accent-sage)] hover:text-[var(--color-accent-gold)] text-lg"
              onClick={handleClose}
            >
              ×
            </button>

            {/* Tabs */}
            <div className="flex mb-6 border-b border-[var(--color-footer)]">
              <button
                onClick={() => setTab("login")}
                className={`flex-1 pb-2 text-sm font-bold tracking-wide ${
                  tab === "login"
                    ? "text-[var(--color-accent-gold)] border-b-2 border-[var(--color-accent-gold)]"
                    : "text-neutral-400"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setTab("signup")}
                className={`flex-1 pb-2 text-sm font-bold tracking-wide ${
                  tab === "signup"
                    ? "text-[var(--color-accent-gold)] border-b-2 border-[var(--color-accent-gold)]"
                    : "text-neutral-400"
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Email Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="Email"
                className="bg-[var(--color-footer)] border border-[var(--color-accent-gold)]/30 px-4 py-2 rounded text-sm focus:outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Password"
                className="bg-[var(--color-footer)] border border-[var(--color-accent-gold)]/30 px-4 py-2 rounded text-sm focus:outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {/* Forgot Password (only on login tab) */}
              {tab === "login" && authError && (
                <button
                  type="button"
                  onClick={() => resetPassword(email)}
                  className="text-xs text-yellow-400 hover:underline text-left ml-1 -mt-2"
                >
                  Forgot your password?
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] px-4 py-2 rounded text-sm text-white font-semibold transition"
              >
                {loading
                  ? tab === "login"
                    ? "Signing in..."
                    : "Creating account..."
                  : tab === "login"
                  ? "Sign In"
                  : "Sign Up"}
              </button>
            </form>

            {/* Error */}
            {authError && (
              <p className="mt-3 text-xs text-red-400 text-center">
                {authError}
              </p>
            )}

            {/* Divider */}
            <div className="flex items-center my-6 gap-3 text-sm text-neutral-400">
              <div className="flex-1 border-t border-[var(--color-footer)]" />
              <span>or</span>
              <div className="flex-1 border-t border-[var(--color-footer)]" />
            </div>

            {/* Google */}
            <img
              className="mx-auto"
              onClick={handleGoogle}
              src={googleCont}
              alt=""
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
