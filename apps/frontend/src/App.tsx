import { Navigate, Route, Routes } from "react-router-dom";
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
import { SafetyLayout } from "./pages/safety/SafetyLayout";
import {
  AccidentsIncidentsTab,
  CargoClaimsTab,
  ComplaintsTab,
  CSAScoreTab,
  DamageReportsTab,
  DOTComplianceTab,
  DOTInspectionsTab,
  DriverFilesTab,
  DrugAlcoholTab,
  EscrowRecordTab,
  ExternalFinesTab,
  HOSViolationsTab,
  HoursOfServiceTab,
  IDVRTab,
  IntegrityReportsTab,
  InsuranceTab,
  InternalFinesTab,
  PermitsTab,
  SafetyMeetingsTab,
  SettingsTab,
  TrailerInterchangesTab,
} from "./pages/safety/tabs";
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
import { ReportsHomePage } from "./pages/reports/ReportsHome";
import { ReportsRunnerPage } from "./pages/reports/ReportsRunner";
import { InvoicesListPage } from "./pages/accounting/InvoicesListPage";
import { InvoiceDetailPage } from "./pages/accounting/InvoiceDetailPage";
import { PaymentsListPage } from "./pages/accounting/PaymentsListPage";
import { PaymentDetailPage } from "./pages/accounting/PaymentDetailPage";
import { FactoringListPage } from "./pages/accounting/FactoringListPage";
import { FactoringDetailPage } from "./pages/accounting/FactoringDetailPage";
import { InternalFineReasonsListPage } from "./pages/lists/safety/InternalFineReasonsListPage";
import { CivilFineTypesListPage } from "./pages/lists/safety/CivilFineTypesListPage";
import { CompanyViolationTypesListPage } from "./pages/lists/safety/CompanyViolationTypesListPage";
import { LoadTypesListPage } from "./pages/lists/dispatch/LoadTypesListPage";
import { DetentionReasonsListPage } from "./pages/lists/dispatch/DetentionReasonsListPage";
import { PickupTimeTypesListPage } from "./pages/lists/dispatch/PickupTimeTypesListPage";
import { AdditionalChargesListPage } from "./pages/lists/dispatch/AdditionalChargesListPage";
import { PayRateTemplatesListPage } from "./pages/lists/driver/PayRateTemplatesListPage";
import { DriverDeductionTypesListPage } from "./pages/lists/driver/DriverDeductionTypesListPage";
import { DriverPayTypesListPage } from "./pages/lists/driver/DriverPayTypesListPage";
import { EscrowTypesListPage } from "./pages/lists/driver/EscrowTypesListPage";

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
              <SafetyLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/safety/driver-files" replace />} />
          <Route path="driver-files" element={<DriverFilesTab />} />
          <Route path="drug-alcohol" element={<DrugAlcoholTab />} />
          <Route path="safety-meetings" element={<SafetyMeetingsTab />} />
          <Route path="hos" element={<HoursOfServiceTab />} />
          <Route path="hos-violations" element={<HOSViolationsTab />} />
          <Route path="idvr" element={<IDVRTab />} />
          <Route path="dot-inspections" element={<DOTInspectionsTab />} />
          <Route path="csa-score" element={<CSAScoreTab />} />
          <Route path="dot-compliance" element={<DOTComplianceTab />} />
          <Route path="accidents" element={<AccidentsIncidentsTab />} />
          <Route path="damage-reports" element={<DamageReportsTab />} />
          <Route path="trailer-interchanges" element={<TrailerInterchangesTab />} />
          <Route path="cargo-claims" element={<CargoClaimsTab />} />
          <Route path="internal-fines" element={<InternalFinesTab />} />
          <Route path="external-fines" element={<ExternalFinesTab />} />
          <Route path="complaints" element={<ComplaintsTab />} />
          <Route path="escrow-record" element={<EscrowRecordTab />} />
          <Route path="insurance" element={<InsuranceTab />} />
          <Route path="permits" element={<PermitsTab />} />
          <Route path="integrity-reports" element={<IntegrityReportsTab />} />
          <Route path="settings" element={<SettingsTab />} />
          <Route path="vehicle-inspections" element={<Navigate to="/safety/idvr" replace />} />
        </Route>
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
              <ComingSoonPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <ReportsHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/invoices"
          element={
            <ProtectedRoute>
              <InvoicesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/invoices/:id"
          element={
            <ProtectedRoute>
              <InvoiceDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/payments"
          element={
            <ProtectedRoute>
              <PaymentsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/payments/:id"
          element={
            <ProtectedRoute>
              <PaymentDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/factoring"
          element={
            <ProtectedRoute>
              <FactoringListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/factoring/:id"
          element={
            <ProtectedRoute>
              <FactoringDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/run/:reportId"
          element={
            <ProtectedRoute>
              <ReportsRunnerPage />
            </ProtectedRoute>
          }
        />
        {[
          // Keep only truly unshipped module redirects here.
          // Shipped modules (Factoring, 425C, Lists) must never be routed via /coming-soon.
          ["/accounting", "Accounting", "5", "Post-launch"],
          ["/driver-app", "Driver App", "3", "T11.15 next week"],
        ].map(([path, feature, phase, eta]) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute>
                {path === "/accounting" ? (
                  <Navigate to="/accounting/invoices" replace />
                ) : (
                  <Navigate to={`/coming-soon?feature=${encodeURIComponent(feature)}&phase=${phase}&eta=${encodeURIComponent(eta)}`} replace />
                )}
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
        {/* ─── Safety catalog routes (T11.21.2A) ─── */}
        <Route
          path="/lists/safety/internal-fine-reasons"
          element={
            <ProtectedRoute>
              <InternalFineReasonsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/safety/civil-fine-types"
          element={
            <ProtectedRoute>
              <CivilFineTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/safety/company-violation-types"
          element={
            <ProtectedRoute>
              <CompanyViolationTypesListPage />
            </ProtectedRoute>
          }
        />
        {/* ─── End Safety catalog routes ─── */}
        {/* ─── Dispatch catalog routes (T11.21.3A) ─── */}
        <Route
          path="/lists/dispatch/load-types"
          element={
            <ProtectedRoute>
              <LoadTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/dispatch/detention-reasons"
          element={
            <ProtectedRoute>
              <DetentionReasonsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/dispatch/pickup-time-types"
          element={
            <ProtectedRoute>
              <PickupTimeTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/dispatch/additional-charges"
          element={
            <ProtectedRoute>
              <AdditionalChargesListPage />
            </ProtectedRoute>
          }
        />
        {/* ─── End Dispatch catalog routes ─── */}
        {/* ─── Driver catalog routes (T11.21.4A) ─── */}
        <Route
          path="/lists/driver/pay-rate-templates"
          element={
            <ProtectedRoute>
              <PayRateTemplatesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/driver/deduction-types"
          element={
            <ProtectedRoute>
              <DriverDeductionTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/driver/pay-types"
          element={
            <ProtectedRoute>
              <DriverPayTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/driver/escrow-types"
          element={
            <ProtectedRoute>
              <EscrowTypesListPage />
            </ProtectedRoute>
          }
        />
        {/* ─── End Driver catalog routes ─── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CompanyProvider>
  );
}
