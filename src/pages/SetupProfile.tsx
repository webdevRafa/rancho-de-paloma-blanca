import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";
import { Loader2, User, Phone, Check } from "lucide-react";

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Format (###) ###-#### while typing; store as digits on save
const formatPhone = (value: string) => {
  const d = value.replace(/\D/g, "").slice(0, 10);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 10);
  if (d.length > 6) return `(${p1}) ${p2}-${p3}`;
  if (d.length > 3) return `(${p1}) ${p2}`;
  if (d.length > 0) return `(${p1}`;
  return "";
};

const isValidPhone = (value: string) => value.replace(/\D/g, "").length === 10;

export default function SetupProfile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Prefill from Firestore (same behavior you had)
  useEffect(() => {
    const run = async () => {
      try {
        if (!user) return;
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data?.name) setName(data.name);
          if (data?.phone) setPhone(formatPhone(String(data.phone)));
        }
      } catch (e) {
        // non-blocking
        console.warn(e);
      }
    };
    run();
  }, [user]);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, ""), [phone]);
  const canSubmit = name.trim().length > 1 && isValidPhone(phone);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!canSubmit) {
      setError("Please enter your full name and a valid 10-digit phone.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      // Normalize and split full name once here
      const full = name.trim().replace(/\s+/g, " ");
      const [firstName, ...rest] = full.split(" ");
      const lastName = rest.join(" ");

      await updateDoc(doc(db, "users", user.uid), {
        name: full,
        firstName, // NEW: stored for reliable split
        lastName, // NEW: stored for reliable split
        phone: phoneDigits, // digits only
        updatedAt: new Date().toISOString(),
      });

      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setError("We couldn’t save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--color-dark)] px-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[var(--color-card)]/60 p-8 text-white">
          <div className="flex items-center gap-3 text-white/80">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="relative min-h-screen overflow-hidden mt-30">
      {/* Subtle backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-footer)]/70 via-[var(--color-background)]/70 to-[var(--color-footer)]/80" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-28 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1fr]"
        >
          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease, delay: 0.05 }}
            className="rounded-3xl border border-white/10 bg-white/90 backdrop-blur p-6 sm:p-8 shadow-2xl"
          >
            {/* Header */}
            <div className="text-center">
              <h1 className="text-2xl md:text-3xl font-gin text-[var(--color-background)] tracking-wide">
                Complete Your Profile
              </h1>
              <p className="mt-2 text-[var(--color-background)]/80 font-acumin">
                A couple quick details and you’ll be ready to book.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {/* Full name */}
              <label className="block">
                <span className="mb-1.5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-background)]/80">
                  <User className="h-4 w-4" /> Full Name
                </span>
                <div className="relative">
                  <input
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Maria Garcia"
                    className="w-full rounded-xl border border-[var(--color-footer)]/30 bg-white px-4 py-3 text-[var(--color-background)] placeholder:text-[var(--color-background)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]/50"
                  />
                  {name.trim().length > 1 && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-600" />
                  )}
                </div>
              </label>

              {/* Phone */}
              <label className="block">
                <span className="mb-1.5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-background)]/80">
                  <Phone className="h-4 w-4" /> Phone Number
                </span>
                <div className="relative">
                  <input
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(555) 555-1234"
                    className="w-full rounded-xl border border-[var(--color-footer)]/30 bg-white px-4 py-3 text-[var(--color-background)] placeholder:text-[var(--color-background)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]/50"
                  />
                  {isValidPhone(phone) && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-600" />
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--color-background)]/60">
                  We’ll use this if we need to reach you about your hunt.
                </p>
              </label>

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}

              {/* Actions */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!canSubmit || saving}
                  className={[
                    "w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition-colors",
                    canSubmit && !saving
                      ? "bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white"
                      : "bg-[var(--color-footer)]/50 text-[var(--color-background)]/60 cursor-not-allowed",
                  ].join(" ")}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save and Continue"
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
