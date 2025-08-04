import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, provider, db } from "../firebase/firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";

// Base context value
interface AuthContextType {
  user: User | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
});

// Context provider
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const signedInUser = result.user;

      const userRef = doc(db, "users", signedInUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: signedInUser.displayName,
          email: signedInUser.email,
          avatarUrl: signedInUser.photoURL,
          createdAt: new Date().toISOString(),
        });
      }

      setUser(signedInUser);
    } catch (error) {
      console.error("Google sign-in failed:", error);
    }
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Augmented custom hook with Firestore user creation fallback
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");

  const checkAndCreateUser = async () => {
    if (!ctx.user) return;

    const userRef = doc(db, "users", ctx.user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        name: ctx.user.displayName,
        email: ctx.user.email,
        avatarUrl: ctx.user.photoURL,
        createdAt: new Date().toISOString(),
      });
    }
  };

  return { ...ctx, checkAndCreateUser };
};
