import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { useEffect, useState, createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, provider, db } from "../firebase/firebaseConfig";

interface AuthContextType {
  user: User | null;
  login: () => Promise<void>; // Alias for Google login
  loginWithGoogle: () => Promise<void>;
  emailLogin: (email: string, password: string) => Promise<void>;
  emailSignup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAndCreateUser: () => Promise<void>;
  authError: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => {},
  loginWithGoogle: async () => {},
  emailLogin: async () => {},
  emailSignup: async () => {},
  logout: async () => {},
  checkAndCreateUser: async () => {},
  authError: null,
  loading: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSignedOut, setIsSignedOut] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (isSignedOut) {
        setIsSignedOut(false);
        return;
      }
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, [isSignedOut]);

  const createUserDoc = async (firebaseUser: User) => {
    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        name: firebaseUser.displayName || "",
        email: firebaseUser.email || "",
        avatarUrl: firebaseUser.photoURL || "",
        createdAt: new Date().toISOString(),
      });
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithPopup(auth, provider);
      const signedInUser = result.user;
      await createUserDoc(signedInUser);
      setUser(signedInUser);
      setAuthError(null);
    } catch (error: any) {
      console.error(error);
      setAuthError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const login = loginWithGoogle; // 👈 Add this for backward compatibility

  const emailLogin = async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await createUserDoc(result.user);
      setUser(result.user);
      setAuthError(null);
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const emailSignup = async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      await createUserDoc(result.user);
      setUser(result.user);
      setAuthError(null);
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("rdp_cart");
      localStorage.removeItem("rdp_order_id");
      setUser(null);
      setIsSignedOut(true);
      navigate("/");
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  const checkAndCreateUser = async () => {
    if (!user) return;
    await createUserDoc(user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        loginWithGoogle,
        emailLogin,
        emailSignup,
        logout,
        checkAndCreateUser,
        authError,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
