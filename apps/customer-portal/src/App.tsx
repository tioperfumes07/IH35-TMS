import type { ReactNode } from "react";
import { Navigate, Route, Routes, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "./api/client";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { InvoiceDetailPage } from "./pages/InvoiceDetailPage";
import { LoadsPage } from "./pages/LoadsPage";
import { LoadDetailPage } from "./pages/LoadDetailPage";

function usePortalMe() {
  return useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => apiRequest<{ customer: { customer_name?: string; id: string } }>("/api/v1/portal/me"),
    retry: false,
  });
}

function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const me = usePortalMe();
  if (me.isLoading) return <div className="p-6 text-sm text-slate-600">Loading…</div>;
  if (me.error instanceof ApiError && me.error.status === 401) {
    if (loc.pathname === "/login") return <>{children}</>;
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold text-slate-900">{me.data?.customer?.customer_name ?? "Portal"}</span>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link className="text-sky-700 hover:underline" to="/dashboard">
              Dashboard
            </Link>
            <Link className="text-sky-700 hover:underline" to="/invoices">
              Invoices
            </Link>
            <Link className="text-sky-700 hover:underline" to="/loads">
              Loads
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <Shell>
            <DashboardPage />
          </Shell>
        }
      />
      <Route
        path="/invoices"
        element={
          <Shell>
            <InvoicesPage />
          </Shell>
        }
      />
      <Route
        path="/invoices/:id"
        element={
          <Shell>
            <InvoiceDetailPage />
          </Shell>
        }
      />
      <Route
        path="/loads"
        element={
          <Shell>
            <LoadsPage />
          </Shell>
        }
      />
      <Route
        path="/loads/:id"
        element={
          <Shell>
            <LoadDetailPage />
          </Shell>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
