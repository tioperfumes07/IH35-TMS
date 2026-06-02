import { Outlet, Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../api/client";
import { Button } from "../components/Button";

export function PortalLayout() {
  const navigate = useNavigate();

  async function onLogout() {
    await apiRequest("/api/v1/portal/auth/logout", { method: "POST" });
    navigate("/portal/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/portal/dashboard" className="text-lg font-semibold text-slate-900">
            IH 35 Shipper Portal
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/portal/dashboard" className="text-slate-700 hover:text-slate-900">
              Loads
            </Link>
            <Link to="/portal/profile" className="text-slate-700 hover:text-slate-900">
              Profile
            </Link>
            <Button variant="secondary" onClick={() => void onLogout()}>
              Sign out
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
