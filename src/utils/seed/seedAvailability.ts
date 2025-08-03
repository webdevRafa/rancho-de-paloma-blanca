import { db } from "../../firebase/firebaseConfig";
import {
  doc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import type { SeasonConfig } from "../../types/Types";

// 🔧 Reuse your existing fetch function or inline it
const getSeasonConfig = async (): Promise<SeasonConfig> => {
  const ref = doc(db, "seasonConfig", "active");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("seasonConfig/active not found");
  }

  return snap.data() as SeasonConfig;
};



// 🚀 Seed Availability Collection
export async function seedAvailability() {
    const seasonConfig = await getSeasonConfig();
    const batch = writeBatch(db);
  
    const startDate = new Date(seasonConfig.seasonStart);
    const endDate = new Date(`${new Date().getFullYear()}-12-31`);
  
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];
  
      const isInSeason =
        current >= new Date(seasonConfig.seasonStart) &&
        current <= new Date(seasonConfig.seasonEnd);
  
      const ref = doc(db, "availability", dateStr);
      batch.set(ref, {
        id: dateStr,
        huntersBooked: 0,
        partyDeckBooked: false,
        isOffSeason: !isInSeason, // helpful for UI later
      });
  
      current.setDate(current.getDate() + 1);
    }
  
    try {
      await batch.commit();
      console.log("✅ Availability seeded through end of year");
    } catch (err) {
      console.error("❌ Seeding failed:", err);
    }
  }