import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isAdmin, authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <p className="text-sm uppercase tracking-[0.25em] text-white/70">
          Checking admin access...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
