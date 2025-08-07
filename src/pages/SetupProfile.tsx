import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";

const formatPhoneNumber = (value: string) => {
  const cleaned = value.replace(/\D/g, ""); // Remove non-digits
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
  if (!match) return value;
  return [match[1], match[2], match[3]]
    .filter(Boolean)
    .join("-")
    .substring(0, 12);
};

const SetupProfile = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Fetch current user profile in case it's partially filled
  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setName(data.name || "");
          setPhone(data.phone || "");
        }
      }
    };

    fetchData();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !user) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      await updateDoc(doc(db, "users", user.uid), {
        name,
        phone,
        updatedAt: new Date().toISOString(),
      });

      // Redirect after saving
      navigate("/dashboard");
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setError("Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-dark)] px-6 py-12 text-[var(--color-text)]">
      <div className="bg-[var(--color-card)] p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-[var(--color-accent-gold)]">
          Complete Your Profile
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Full Name"
            className="bg-[var(--color-footer)] px-4 py-2 rounded border border-[var(--color-accent-gold)]/20 focus:outline-none text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
            placeholder="Phone Number"
            className="input"
          />

          {error && (
            <p className="text-sm text-red-400 text-center -mt-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] px-4 py-2 rounded text-sm text-white font-semibold transition"
          >
            {saving ? "Saving..." : "Save and Continue"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetupProfile;
