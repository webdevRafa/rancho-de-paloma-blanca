// /components/AuthModal.tsx
import { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { FiEye, FiEyeOff } from "react-icons/fi";
import googleCont from "../assets/cont-w-google.png";
import logo from "../assets/logo-official.webp";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal = ({ isOpen, onClose }: Props) => {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    loginWithGoogle,
    emailLogin,
    emailSignup,
    authError,
    loading,
    resetPassword,
    setAuthError,
  } = useAuth();

  // Simple local validity: both non-empty and identical (for signup only)
  const pwMatch = useMemo(() => {
    if (tab === "login") return true;
    return password.length > 0 && confirm.length > 0 && password === confirm;
  }, [tab, password, confirm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (tab === "login") {
      await emailLogin(email, password);
      onClose();
      return;
    }

    // Signup path: enforce match before calling
    if (!pwMatch) {
      setAuthError?.("Passwords do not match.");
      return;
    }

    await emailSignup(email, password);
    onClose();
  };

  const handleGoogle = async () => {
    await loginWithGoogle();
    onClose();
  };

  const handleClose = () => {
    setEmail("");
    setPassword("");
    setConfirm("");
    setShowPassword(false);
    setShowConfirm(false);
    setTab("login");
    setAuthError?.(null);
    onClose();
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
            className="bg-white max-w-md w-full rounded-lg shadow-lg p-6 text-[var(--color-text)] relative"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
          >
            {/* Close Button */}
            <button
              className="absolute top-2 right-3 text-[var(--color-accent-sage)] hover:text-[var(--color-accent-gold)] text-4xl"
              onClick={handleClose}
              aria-label="Close"
              type="button"
            >
              ×
            </button>

            <img
              className="max-w-[100px] mx-auto"
              src={logo}
              alt="Rancho de Paloma Blanca"
            />

            {/* Tabs */}
            <div className="flex mb-6" role="tablist" aria-label="Auth tabs">
              <button
                type="button"
                onClick={() => {
                  setTab("login");
                  setAuthError?.(null);
                }}
                className={`flex-1 pb-2 text-sm font-bold tracking-wide ${
                  tab === "login"
                    ? "text-[var(--color-accent-gold)] border-b-2 border-[var(--color-accent-gold)]"
                    : "text-neutral-400"
                }`}
                role="tab"
                aria-selected={tab === "login"}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("signup");
                  setAuthError?.(null);
                }}
                className={`flex-1 pb-2 text-sm font-bold tracking-wide ${
                  tab === "signup"
                    ? "text-[var(--color-accent-gold)] border-b-2 border-[var(--color-accent-gold)]"
                    : "text-neutral-400"
                }`}
                role="tab"
                aria-selected={tab === "signup"}
              >
                Sign Up
              </button>
            </div>

            {/* Email / Password Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="Email"
                className="bg-neutral-100 text-[var(--color-background)] px-4 py-2 rounded text-sm focus:outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete={tab === "login" ? "email" : "new-email"}
                inputMode="email"
              />

              {/* Password with eye toggle */}
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  className="bg-neutral-100 text-[var(--color-background)] w-full pr-10 pl-4 py-2 rounded text-sm focus:outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={
                    tab === "login" ? "current-password" : "new-password"
                  }
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-2 flex items-center justify-center p-2 text-neutral-500 hover:text-neutral-700"
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>

              {/* Confirm Password (signup only) */}
              {tab === "signup" && (
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    placeholder="Confirm password"
                    className={`bg-neutral-100 text-[var(--color-background)] w-full pr-10 pl-4 py-2 rounded text-sm focus:outline-none ${
                      confirm.length > 0 && !pwMatch
                        ? "ring-1 ring-red-500"
                        : ""
                    }`}
                    aria-invalid={confirm.length > 0 && !pwMatch}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    onClick={() => setShowConfirm((s) => !s)}
                    className="absolute inset-y-0 right-2 flex items-center justify-center p-2 text-neutral-500 hover:text-neutral-700"
                  >
                    {showConfirm ? <FiEyeOff /> : <FiEye />}
                  </button>

                  {/* Inline helper for mismatch */}
                  {confirm.length > 0 && !pwMatch && (
                    <p className="mt-1 text-xs text-red-500">
                      Passwords do not match.
                    </p>
                  )}
                </div>
              )}

              {/* Forgot Password (only on login tab & if we have an error) */}
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
                disabled={loading || (tab === "signup" && !pwMatch)}
                className={`bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] px-4 py-2 rounded text-sm text-white font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {loading
                  ? tab === "login"
                    ? "Signing in..."
                    : "Creating account..."
                  : tab === "login"
                  ? "Sign In"
                  : pwMatch
                  ? "Sign Up"
                  : "Passwords must match"}
              </button>
            </form>

            {/* Error */}
            {authError && (
              <p className="mt-3 text-xs text-red-500 text-center">
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
              className="mx-auto cursor-pointer"
              onClick={handleGoogle}
              src={googleCont}
              alt="Continue with Google"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
