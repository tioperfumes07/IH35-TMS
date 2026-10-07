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
    <div className="min-h-screen bg-[#F7F8FA] text-[#0F1219]">
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/portal/dashboard" className="text-page-title font-semibold text-[#0F1219]">
            IH 35 Shipper Portal
          </Link>
          <nav className="flex items-center gap-3 text-xs">
            <Link to="/portal/dashboard" className="text-[#1F2A44] hover:text-[#0F1219]">
              Loads
            </Link>
            <Link to="/portal/profile" className="text-[#1F2A44] hover:text-[#0F1219]">
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
