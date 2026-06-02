import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiRequest } from "../api/client";

export function PortalRouteGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    let active = true;
    async function run() {
      try {
        await apiRequest("/api/v1/portal/profile");
        if (active) setState("ok");
      } catch {
        if (active) setState("denied");
      }
    }
    void run();
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") {
    return <p className="text-sm text-slate-600">Checking session…</p>;
  }
  if (state === "denied") {
    return <Navigate to="/portal/login" replace />;
  }
  return <>{children}</>;
}
