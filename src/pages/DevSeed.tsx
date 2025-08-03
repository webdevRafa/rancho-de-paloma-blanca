import { useState } from "react";
import { seedAvailability } from "../utils/seed/seedAvailability";
import { useAuth } from "../context/AuthContext"; // adjust if needed

const DevSeed = () => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { user } = useAuth();
  const handleSeed = async () => {
    setLoading(true);
    try {
      await seedAvailability();
      setDone(true);
    } catch (err) {
      console.error("Error seeding availability:", err);
      alert("Failed to seed availability");
    } finally {
      setLoading(false);
    }
  };
  if (user?.email !== "support@satxink.com") {
    return (
      <div className="text-center mt-20 text-red-500 font-semibold">
        Not authorized
      </div>
    );
  }

  return (
    <div className="p-10 text-white mt-30 mx-auto max-w-6xl">
      <h1 className="text-3xl mb-4  text-white">Dev Seeder</h1>

      <button
        onClick={handleSeed}
        disabled={loading}
        className="bg-[var(--color-button)] px-2 py-1 rounded text-white hover:bg-[var(--color-button-hover)] disabled:opacity-50 text-sm"
      >
        {loading ? "Seeding..." : "Seed Availability Data"}
      </button>

      {done && <p className="mt-4 text-green-400">✅ Seeding complete!</p>}
    </div>
  );
};

export default DevSeed;
