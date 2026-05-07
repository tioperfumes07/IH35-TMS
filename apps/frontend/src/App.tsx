import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth/useAuth";
import { Shell } from "./components/Shell";
import { CompanyProvider } from "./contexts/CompanyContext";
import { CustomersPage } from "./pages/Customers";
import { CustomerDetailPage } from "./pages/CustomerDetail";
import { ListsHubPage } from "./pages/lists/ListsHubPage";
import { DriverDetailPage } from "./pages/DriverDetail";
import { DriverLoadStatusesPage } from "./pages/DriverLoadStatusesPage";
import { DriversPage } from "./pages/Drivers";
import { DispatchPage } from "./pages/Dispatch";
import { DispatchHomePage } from "./pages/dispatch/DispatchHome";
import { SettlementsPage } from "./pages/driver-finance/SettlementsPage";
import { FuelPlannerHomePage } from "./pages/fuel/FuelPlannerHome";
import { BankingHomePage } from "./pages/banking/BankingHome";
import { SafetyHomePage } from "./pages/safety/SafetyHome";
import { LiabilitiesHomePage } from "./pages/liabilities/LiabilitiesHome";
import { MaintenanceHomePage } from "./pages/maintenance/MaintenanceHome";
import { CashAdvancesHomePage } from "./pages/cash-advances/CashAdvancesHome";
import { FactoringHomePage } from "./pages/factoring/FactoringHome";
import { EquipmentTypesPage } from "./pages/EquipmentTypesPage";
import { HomePage } from "./pages/Home";
import { LoginPage } from "./pages/Login";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { DocumentsPage } from "./pages/Documents";
import { UserDetailPage } from "./pages/UserDetail";
import { UsersPage } from "./pages/Users";
import { VendorsPage } from "./pages/Vendors";
import { VendorDetailPage } from "./pages/VendorDetail";
import { Form425CHome } from "./pages/form425c/Form425CHome";

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

function ComingSoonRoute() {
  const location = useLocation();
  const feature = (new URLSearchParams(location.search).get("feature") ?? "").toLowerCase();

  // Defensive hotfix: legacy /coming-soon links for already-shipped modules
  // should resolve to the live routes.
  if (feature.includes("lists")) return <Navigate to="/lists" replace />;
  if (feature.includes("425c") || feature.includes("form 425c")) return <Navigate to="/425c" replace />;
  if (feature.includes("factoring")) return <Navigate to="/factoring" replace />;

  return <ComingSoonPage />;
}

export default function App() {
  const dispatchV2Enabled = import.meta.env.VITE_DISPATCH_V2_ENABLED === "true";
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
          path="/users/:id"
          element={
            <ProtectedRoute>
              <UserDetailPage />
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
          path="/customers/:id"
          element={
            <ProtectedRoute>
              <CustomerDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendors"
          element={
            <ProtectedRoute>
              <VendorsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendors/:id"
          element={
            <ProtectedRoute>
              <VendorDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <DocumentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch"
          element={
            <ProtectedRoute>
              {dispatchV2Enabled ? <DispatchHomePage /> : <DispatchPage />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/fuel"
          element={
            <ProtectedRoute>
              <FuelPlannerHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking"
          element={
            <ProtectedRoute>
              <BankingHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/safety"
          element={
            <ProtectedRoute>
              <SafetyHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/liabilities"
          element={
            <ProtectedRoute>
              <LiabilitiesHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance"
          element={
            <ProtectedRoute>
              <MaintenanceHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cash-advances"
          element={
            <ProtectedRoute>
              <CashAdvancesHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring"
          element={
            <ProtectedRoute>
              <FactoringHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver-finance/settlements"
          element={
            <ProtectedRoute>
              <SettlementsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/425c"
          element={
            <ProtectedRoute>
              <Form425CHome />
            </ProtectedRoute>
          }
        />
        <Route path="/form-425c" element={<Navigate to="/425c" replace />} />
        <Route
          path="/catalogs"
          element={
            <ProtectedRoute>
              <Navigate to="/lists" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists"
          element={
            <ProtectedRoute>
              <ListsHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/:domain"
          element={
            <ProtectedRoute>
              <ComingSoonPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/:domain/:catalogKey"
          element={
            <ProtectedRoute>
              <ComingSoonPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/coming-soon"
          element={
            <ProtectedRoute>
              <ComingSoonRoute />
            </ProtectedRoute>
          }
        />
        {[
          ["/accounting", "Accounting", "5", "Post-launch"],
          ["/reports", "Reports", "3", "T11.16 next week"],
          ["/driver-app", "Driver App", "3", "T11.15 next week"],
        ].map(([path, feature, phase, eta]) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute>
                <Navigate to={`/coming-soon?feature=${encodeURIComponent(feature)}&phase=${phase}&eta=${encodeURIComponent(eta)}`} replace />
              </ProtectedRoute>
            }
          />
        ))}
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
              <Navigate to="/coming-soon?feature=Chart%20of%20Accounts&phase=5&eta=After%20accounting%20cutover" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/classes"
          element={
            <ProtectedRoute>
              <Navigate to="/coming-soon?feature=Classes&phase=5&eta=After%20accounting%20cutover" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/items"
          element={
            <ProtectedRoute>
              <Navigate to="/coming-soon?feature=Items&phase=5&eta=After%20accounting%20cutover" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/payment-terms"
          element={
            <ProtectedRoute>
              <Navigate to="/coming-soon?feature=Payment%20Terms&phase=5&eta=After%20accounting%20cutover" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/posting-templates"
          element={
            <ProtectedRoute>
              <Navigate to="/coming-soon?feature=Posting%20Templates&phase=5&eta=After%20accounting%20cutover" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/account-role-bindings"
          element={
            <ProtectedRoute>
              <Navigate to="/coming-soon?feature=Account%20Role%20Bindings&phase=5&eta=After%20accounting%20cutover" replace />
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
