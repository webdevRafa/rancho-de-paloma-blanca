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
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, provider, db } from "../firebase/firebaseConfig";
import { sendPasswordResetEmail } from "firebase/auth";

const getFriendlyError = (code: string): string => {
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-not-found":
      return "No account found with that email.";
    case "auth/wrong-password":
      return "Incorrect password. Please try again.";
    case "auth/email-already-in-use":
      return "An account already exists with this email.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-credential":
      return "Invalid credentials. Try again or reset your password.";
    default:
      return "Something went wrong. Please try again.";
  }
};

type AppUserDoc = {
  uid?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  role?: "client" | "admin";
  createdAt?: unknown;
};

interface AuthContextType {
  user: User | null;
  userDoc: AppUserDoc | null;
  isAdmin: boolean;
  authReady: boolean;
  login: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  emailLogin: (email: string, password: string) => Promise<void>;
  emailSignup: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAndCreateUser: () => Promise<void>;
  authError: string | null;
  setAuthError: (msg: string | null) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userDoc: null,
  isAdmin: false,
  authReady: false,
  login: async () => {},
  loginWithGoogle: async () => {},
  emailLogin: async () => {},
  emailSignup: async () => {},
  resetPassword: async () => {},
  setAuthError: async () => {},
  logout: async () => {},
  checkAndCreateUser: async () => {},
  authError: null,
  loading: false,
});
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<AppUserDoc | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSignedOut, setIsSignedOut] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (isSignedOut) {
        setIsSignedOut(false);
        setAuthReady(true);
        return;
      }

      setUser(firebaseUser);

      if (!firebaseUser) {
        setUserDoc(null);
        setAuthReady(true);
        return;
      }

      try {
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          const fallbackUserDoc = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || "",
            email: firebaseUser.email || "",
            avatarUrl: firebaseUser.photoURL || "",
            role: "client" as const,
            createdAt: serverTimestamp(),
          };

          await setDoc(userRef, fallbackUserDoc);
          setUserDoc({
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || "",
            email: firebaseUser.email || "",
            avatarUrl: firebaseUser.photoURL || "",
            role: "client",
          });
        } else {
          setUserDoc(userSnap.data() as AppUserDoc);
        }
      } catch (error) {
        console.error("Failed to load Firestore user doc:", error);
        setUserDoc(null);
      } finally {
        setAuthReady(true);
      }
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
        role: "client",
        createdAt: serverTimestamp(),
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
      setAuthError(getFriendlyError(error.code));
    } finally {
      setLoading(false);
    }
  };

  const login = loginWithGoogle;

  const emailLogin = async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await createUserDoc(result.user);
      setUser(result.user);
      setAuthError(null);
    } catch (err: any) {
      console.error(err);
      setAuthError(getFriendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const emailSignup = async (email: string, password: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Create user doc in Firestore with role
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        role: "client",
        createdAt: serverTimestamp(),
      });
      navigate("/setup-profile");
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIXED: moved inside component
  const resetPassword = async (email: string) => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthError("Password reset email sent. Check your inbox.");
    } catch (err: any) {
      console.error(err);
      setAuthError(getFriendlyError(err.code));
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
      setUserDoc(null);
      setAuthReady(false);
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

  const isAdmin = userDoc?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        userDoc,
        isAdmin,
        authReady,
        login,
        loginWithGoogle,
        emailLogin,
        emailSignup,
        resetPassword,
        logout,
        setAuthError,
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
