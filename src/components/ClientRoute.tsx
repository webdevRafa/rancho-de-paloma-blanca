import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ClientRoute({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0b0806] text-white flex items-center justify-center px-6">
        <p className="text-sm uppercase tracking-[0.22em] text-white/60">
          Checking your account...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/book" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
