import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { useEffect, useState, createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, provider, db } from "../firebase/firebaseConfig";

interface AuthContextType {
  user: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  checkAndCreateUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => {},
  logout: async () => {},
  checkAndCreateUser: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  // Track if the user manually logged out
  const [isSignedOut, setIsSignedOut] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      // Prevent auto re-login after signout
      if (isSignedOut) {
        setIsSignedOut(false); // reset
        return;
      }
      setUser(firebaseUser);
    });

    return () => unsubscribe();
  }, [isSignedOut]);

  const login = async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);

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

  const logout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("rdp_cart");
      localStorage.removeItem("rdp_order_id");
      setUser(null);
      setIsSignedOut(true); // block onAuthStateChanged callback
      navigate("/");
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  const checkAndCreateUser = async () => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        name: user.displayName,
        email: user.email,
        avatarUrl: user.photoURL,
        createdAt: new Date().toISOString(),
      });
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, checkAndCreateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
