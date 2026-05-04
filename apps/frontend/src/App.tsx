import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth/useAuth";
import { Shell } from "./components/Shell";
import { CompanyProvider } from "./contexts/CompanyContext";
import { CustomersPage } from "./pages/Customers";
import { CatalogsHubPage } from "./pages/CatalogsHubPage";
import { DriverDetailPage } from "./pages/DriverDetail";
import { DriverLoadStatusesPage } from "./pages/DriverLoadStatusesPage";
import { DriversPage } from "./pages/Drivers";
import { EquipmentTypesPage } from "./pages/EquipmentTypesPage";
import { HomePage } from "./pages/Home";
import { LoginPage } from "./pages/Login";
import { UsersPage } from "./pages/Users";

function RootRedirect() {
  const auth = useAuth();
  if (auth.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Checking session...</div>;
  }
  if (!auth.user || auth.isUnauthenticated) return <Navigate to="/login" replace />;
  return <Navigate to="/home" replace />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Checking session...</div>;
  }
  if (!auth.user || auth.isUnauthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Shell auth={auth.user}>{children}</Shell>;
}

function HomeRoute() {
  const auth = useAuth();
  if (!auth.user) return null;
  return <HomePage auth={auth.user} />;
}

function CatalogComingSoonPage({ title }: { title: string }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <p className="mt-1 text-sm text-gray-600">Catalog detail page is coming in a follow-up block.</p>
    </div>
  );
}

export default function App() {
  return (
    <CompanyProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomeRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers"
          element={
            <ProtectedRoute>
              <DriversPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute>
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs"
          element={
            <ProtectedRoute>
              <CatalogsHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/equipment-types"
          element={
            <ProtectedRoute>
              <EquipmentTypesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/driver-load-statuses"
          element={
            <ProtectedRoute>
              <DriverLoadStatusesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/accounts"
          element={
            <ProtectedRoute>
              <CatalogComingSoonPage title="Chart of Accounts" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/classes"
          element={
            <ProtectedRoute>
              <CatalogComingSoonPage title="Classes" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/items"
          element={
            <ProtectedRoute>
              <CatalogComingSoonPage title="Items" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/payment-terms"
          element={
            <ProtectedRoute>
              <CatalogComingSoonPage title="Payment Terms" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/posting-templates"
          element={
            <ProtectedRoute>
              <CatalogComingSoonPage title="Posting Templates" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/account-role-bindings"
          element={
            <ProtectedRoute>
              <CatalogComingSoonPage title="Account Role Bindings" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/:id"
          element={
            <ProtectedRoute>
              <DriverDetailPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CompanyProvider>
  );
}
