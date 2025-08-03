// utils/getSeasonConfig.ts
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import type { SeasonConfig } from "../types/Types";

export const getSeasonConfig = async (): Promise<SeasonConfig> => {
  const ref = doc(db, "seasonConfig", "active");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("seasonConfig/active not found");
  }

  return snap.data() as SeasonConfig;
};
