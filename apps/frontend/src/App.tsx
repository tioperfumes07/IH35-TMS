import { Navigate, Route, Routes, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth/useAuth";
import { Shell } from "./components/Shell";
import { CompanyProvider } from "./contexts/CompanyContext";
import { useCompanyContext } from "./contexts/CompanyContext";
import { AccountingCustomerDetailPage, CustomersListPage, SuspenseShell } from "./router";
import { ListsHubPage } from "./pages/lists/ListsHubPage";
import { DriverDetailPage } from "./pages/DriverDetail";
import { DriverLoadStatusesPage } from "./pages/DriverLoadStatusesPage";
import { DriversPage } from "./pages/Drivers";
import { DispatchPage } from "./pages/Dispatch";
import { DispatchAlertsPage } from "./pages/dispatch/DispatchAlertsPage";
import { SettlementsPage } from "./pages/driver-finance/SettlementsPage";
import { CashAdvanceRequestsPage } from "./pages/driver-finance/CashAdvanceRequestsPage";
import { OwnerApprovalPortalPage } from "./pages/driver-finance/OwnerApprovalPortalPage";
import { FuelPlannerHomePage } from "./pages/fuel/FuelPlannerHome";
import { BankingHomePage } from "./pages/banking/BankingHome";
import { TransfersListPage } from "./pages/banking/TransfersListPage";
import { BankingObligationReconcilePage } from "./pages/banking/BankingObligationReconcilePage";
import { ReconciliationWorkspacePage } from "./pages/banking/ReconciliationWorkspace";
import { CategorizationRulesPage } from "./pages/banking/CategorizationRulesPage";
import { QboSyncQueuePage } from "./pages/banking/QboSyncQueuePage";
import { EmailQueuePage } from "./pages/banking/EmailQueuePage";
import { BankAccountDetailPage } from "./pages/banking/BankAccountDetail";
import { BankingRulesPage } from "./pages/banking/BankingRulesPage";
import { BankingReconciliationListPage, BankingReconciliationSessionPage } from "./pages/banking/BankingReconciliationWave2Page";
import { BankingTransactionsListPage } from "./pages/banking/BankingTransactionsListPage";
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
import { WorkOrdersConsoleDetailPage } from "./pages/work-orders/WorkOrdersConsoleDetailPage";
import { WorkOrdersConsoleListPage } from "./pages/work-orders/WorkOrdersConsoleListPage";
import { WorkOrderDetailPage } from "./pages/maintenance/WorkOrderDetailPage";
import { ArrivingSoonPage } from "./pages/maintenance/ArrivingSoonPage";
import { CashAdvancesHomePage } from "./pages/cash-advances/CashAdvancesHome";
import { FactoringHomePage } from "./pages/factoring/FactoringHome";
import { AssetProfilePage } from "./pages/fleet/AssetProfilePage";
import { EquipmentTypesPage } from "./pages/EquipmentTypesPage";
import { HomePage } from "./pages/Home";
import { LoginPage } from "./pages/Login";
import { LoginResetRequestPage } from "./pages/LoginResetRequestPage";
import { LoginResetConfirmPage } from "./pages/LoginResetConfirmPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { SamsaraIntegrationPage } from "./pages/integrations/SamsaraIntegrationPage";
import { DriverAppLandingPage } from "./pages/DriverAppLandingPage";
import { DisputesPage } from "./pages/driver/DisputesPage";
import { DriverShell } from "./pages/driver/DriverShell";
import { DriverLoginPage } from "./pages/driver/DriverLoginPage";
import { DriverLoadsPage } from "./pages/driver/DriverLoadsPage";
import { DriverLoadDetailPage } from "./pages/driver/DriverLoadDetailPage";
import { DriverHosPage } from "./pages/driver/DriverHosPage";
import { DriverSettingsPage } from "./pages/driver/DriverSettingsPage";
import { FuelReceiptPage } from "./pages/driver/FuelReceiptPage";
import { NotificationPreferencesPage } from "./pages/settings/NotificationPreferencesPage";
import { UserProfileSettingsPage } from "./pages/settings/UserProfileSettingsPage";
import { DocumentsPage } from "./pages/Documents";
import { UserDetailPage } from "./pages/UserDetail";
import { UsersPage } from "./pages/Users";
import { VendorsPage } from "./pages/Vendors";
import { VendorDetailPage } from "./pages/VendorDetail";
import { Form425CHome } from "./pages/form425c/Form425CHome";
import { HelpCenterPage } from "./pages/help/HelpCenterPage";
import { HelpArticlePage } from "./pages/help/HelpArticlePage";
import { ReportsHomePage } from "./pages/reports/ReportsHome";
import { ReportsRunnerPage } from "./pages/reports/ReportsRunner";
import { ARAgingPage } from "./pages/reports/ARAgingPage";
import { APAgingPage } from "./pages/reports/APAgingPage";
import { CashFlowOverviewPage } from "./pages/reports/CashFlowOverviewPage";
import { SettlementSummaryPage } from "./pages/reports/SettlementSummaryPage";
import { CustomerProfitabilityPage } from "./pages/reports/CustomerProfitabilityPage";
import { ProfitPerTruckPage } from "./pages/reports/ProfitPerTruckPage";
import { FuelReconciliationPage } from "./pages/reports/FuelReconciliationPage";
import { MaintenanceCostPerUnitPage } from "./pages/reports/MaintenanceCostPerUnitPage";
import { ScheduledReportsPage } from "./pages/reports/ScheduledReportsPage";
import { QBOSyncStatusDashboardPage } from "./pages/qbo/QBOSyncStatusDashboardPage";
import { InvoicesListPage } from "./pages/accounting/InvoicesListPage";
import { AccountingHubPage } from "./pages/accounting/AccountingHubPage";
import { PeriodClosePage } from "./pages/accounting/PeriodClosePage";
import { AccountingReportsWave2Page } from "./pages/accounting/AccountingReportsWave2Page";
import { AccountingSyncConflictsPage, AccountingSyncConflictDetailPage } from "./pages/accounting/AccountingSyncConflictsPage";
import { AccountingSalesTaxPage, Accounting1099Page } from "./pages/accounting/AccountingTaxPages";
import { DisputeQueuePage } from "./pages/accounting/DisputeQueuePage";
import { AbandonmentQueuePage } from "./pages/accounting/AbandonmentQueuePage";
import { InvoiceDetailPage } from "./pages/accounting/InvoiceDetailPage";
import { PaymentsListPage } from "./pages/accounting/PaymentsListPage";
import { PaymentDetailPage } from "./pages/accounting/PaymentDetailPage";
import { FactoringListPage } from "./pages/accounting/FactoringListPage";
import { FactoringDetailPage } from "./pages/accounting/FactoringDetailPage";
import { VendorBillCreatePage } from "./pages/accounting/VendorBillCreatePage";
import { ExpenseCreatePage } from "./pages/accounting/ExpenseCreatePage";
import { BillsPage } from "./pages/accounting/BillsPage";
import { ForensicReviewPage } from "./pages/forensic/ForensicReviewPage";
import { ActivityLogPage } from "./pages/admin/ActivityLogPage";
import { MigrationStatusPage } from "./pages/admin/MigrationStatus";
import { ErrorMonitorPage } from "./pages/admin/ErrorMonitor";
import { IntegrityAdminPage } from "./pages/admin/IntegrityAdminPage";
import { AdminSyncHealthPage } from "./pages/admin/AdminSyncHealthPage";
import { DataImportPage } from "./pages/admin/DataImportPage";
import { AccountRoleBindingsListPage } from "./pages/lists/accounting/AccountRoleBindingsListPage";
import { ChartOfAccountsListPage } from "./pages/lists/accounting/ChartOfAccountsListPage";
import { ChartOfAccountsSeedsListPage } from "./pages/lists/accounting/ChartOfAccountsSeedsListPage";
import { ClassesListPage } from "./pages/lists/accounting/ClassesListPage";
import { CurrencyCodesListPage } from "./pages/lists/accounting/CurrencyCodesListPage";
import { ExpenseCategoriesListPage } from "./pages/lists/accounting/ExpenseCategoriesListPage";
import { ItemsListPage } from "./pages/lists/accounting/ItemsListPage";
import { JournalEntryTypesListPage } from "./pages/lists/accounting/JournalEntryTypesListPage";
import { PaymentTermsListPage } from "./pages/lists/accounting/PaymentTermsListPage";
import { PaymentMethodsListPage } from "./pages/lists/accounting/PaymentMethodsListPage";
import { PostingTemplatesListPage } from "./pages/lists/accounting/PostingTemplatesListPage";
import { QBOBulkLinkPage } from "./pages/lists/accounting/QBOBulkLinkPage";
import { QboCategoriesListPage } from "./pages/lists/accounting/QboCategoriesListPage";
import { TaxCodesListPage } from "./pages/lists/accounting/TaxCodesListPage";
import { AbandonmentDefaultsPage } from "./pages/lists/accounting/AbandonmentDefaultsPage";
import { AdditionalChargesListPage } from "./pages/lists/dispatch/AdditionalChargesListPage";
import { DetentionReasonsListPage } from "./pages/lists/dispatch/DetentionReasonsListPage";
import { LoadTypesListPage } from "./pages/lists/dispatch/LoadTypesListPage";
import { PickupTimeTypesListPage } from "./pages/lists/dispatch/PickupTimeTypesListPage";
import { DriverDeductionTypesListPage } from "./pages/lists/driver/DriverDeductionTypesListPage";
import { DriverPayTypesListPage } from "./pages/lists/driver/DriverPayTypesListPage";
import { DriverTeamsPage } from "./pages/lists/driver/DriverTeamsPage";
import { EscrowTypesListPage } from "./pages/lists/driver/EscrowTypesListPage";
import { PayRateTemplatesListPage } from "./pages/lists/driver/PayRateTemplatesListPage";
import { ConditionCodesListPage } from "./pages/lists/fleet/ConditionCodesListPage";
import { AssetLocationsListPage } from "./pages/lists/fleet/AssetLocationsListPage";
import { AssetStatusesListPage } from "./pages/lists/fleet/AssetStatusesListPage";
import { EquipmentTypesListPage } from "./pages/lists/fleet/EquipmentTypesListPage";
import { LeaseTermsListPage } from "./pages/lists/fleet/LeaseTermsListPage";
import { OwnershipTypesListPage } from "./pages/lists/fleet/OwnershipTypesListPage";
import { TirePositionsListPage } from "./pages/lists/fleet/TirePositionsListPage";
import { TractorStatusesListPage } from "./pages/lists/fleet/TractorStatusesListPage";
import { TrailerStatusesListPage } from "./pages/lists/fleet/TrailerStatusesListPage";
import { TrailerTypesListPage } from "./pages/lists/fleet/TrailerTypesListPage";
import { ExpensiveStatesListPage } from "./pages/lists/fuel/ExpensiveStatesListPage";
import { FuelBrandsListPage } from "./pages/lists/fuel/FuelBrandsListPage";
import { FuelCardTypesListPage } from "./pages/lists/fuel/FuelCardTypesListPage";
import { FuelExceptionTypesListPage } from "./pages/lists/fuel/FuelExceptionTypesListPage";
import { FuelGradesListPage } from "./pages/lists/fuel/FuelGradesListPage";
import { FuelStationBrandsListPage } from "./pages/lists/fuel/FuelStationBrandsListPage";
import { FuelStopReasonCodesListPage } from "./pages/lists/fuel/FuelStopReasonCodesListPage";
import { FuelTaxJurisdictionsListPage } from "./pages/lists/fuel/FuelTaxJurisdictionsListPage";
import { FuelDispatchRoutesListPage } from "./pages/lists/fuel/FuelDispatchRoutesListPage";
import { FuelPumpTypesListPage } from "./pages/lists/fuel/FuelPumpTypesListPage";
import { FuelStationStatesListPage } from "./pages/lists/fuel/FuelStationStatesListPage";
import { MpgBandsListPage } from "./pages/lists/fuel/MpgBandsListPage";
import { MaintenanceFailureCodesListPage } from "./pages/lists/maintenance/MaintenanceFailureCodesListPage";
import { MaintenanceLaborCodesListPage } from "./pages/lists/maintenance/MaintenanceLaborCodesListPage";
import { MaintenancePartsListPage } from "./pages/lists/maintenance/MaintenancePartsListPage";
import { MaintenancePriorityLevelsListPage } from "./pages/lists/maintenance/MaintenancePriorityLevelsListPage";
import { MaintenanceServiceTasksListPage } from "./pages/lists/maintenance/MaintenanceServiceTasksListPage";
import { MaintenanceShopLocationsListPage } from "./pages/lists/maintenance/MaintenanceShopLocationsListPage";
import { MaintenanceVendorsListPage } from "./pages/lists/maintenance/MaintenanceVendorsListPage";
import { WorkOrderStatusesListPage } from "./pages/lists/maintenance/WorkOrderStatusesListPage";
import { CivilFineTypesListPage } from "./pages/lists/safety/CivilFineTypesListPage";
import { CompanyViolationTypesListPage } from "./pages/lists/safety/CompanyViolationTypesListPage";
import { InternalFineReasonsListPage } from "./pages/lists/safety/InternalFineReasonsListPage";
import { LegalTemplateDetailPage } from "./pages/legal/templates/LegalTemplateDetailPage";
import { LegalTemplatesListPage } from "./pages/legal/templates/LegalTemplatesListPage";
import { LegalSignPage } from "./pages/legal/sign/LegalSignPage";
import { LegalAttorneyReviewPortalPage } from "./pages/legal/attorney-review/LegalAttorneyReviewPortalPage";
import { LegalLandingPage } from "./pages/legal/LegalLandingPage";
import { LegalContractInstancesPage } from "./pages/legal/contracts/LegalContractInstancesPage";
import { LegalPoliciesPage } from "./pages/legal/LegalPoliciesPage";
import { PrivacyPolicyPage } from "./pages/legal/PrivacyPolicyPage";
import { TermsOfServicePage } from "./pages/legal/TermsOfServicePage";
import { LegalAttorneyReviewPage } from "./pages/legal/LegalAttorneyReviewPage";
import { LegalMattersListPage } from "./pages/legal/matters/LegalMattersListPage";
import { LegalMatterNewPage } from "./pages/legal/matters/LegalMatterNewPage";
import { LegalMatterDetailPage } from "./pages/legal/matters/LegalMatterDetailPage";
import { LegalReportsLandingPage } from "./pages/legal/reports/LegalReportsLandingPage";
import { DriverSchedulerGridPage } from "./pages/safety/driver-scheduler/DriverSchedulerGridPage";
import { DriverSchedulerRequestInboxPage } from "./pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage";
import { DriverSchedulerRequestDetailPage } from "./pages/safety/driver-scheduler/DriverSchedulerRequestDetailPage";
import { DriverLeaveBalancesPage } from "./pages/safety/driver-scheduler/DriverLeaveBalancesPage";

function BankingReconciliationSessionRoute() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  return <BankingReconciliationSessionPage sessionId={sessionId} />;
}

function AccountingSyncConflictRoute() {
  const { conflictId = "" } = useParams<{ conflictId: string }>();
  return <AccountingSyncConflictDetailPage conflictId={conflictId} />;
}

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

function OwnerAdminRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Checking session...</div>;
  }
  if (!auth.user || auth.isUnauthenticated) {
    return <Navigate to="/login" replace />;
  }
  const role = String(auth.user.role ?? "");
  if (role !== "Owner" && role !== "Administrator") {
    return <Navigate to="/home" replace />;
  }
  return <Shell auth={auth.user}>{children}</Shell>;
}

function OwnerSuperAdminRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Checking session...</div>;
  }
  if (!auth.user || auth.isUnauthenticated) {
    return <Navigate to="/login" replace />;
  }
  const role = String(auth.user.role ?? "");
  if (role !== "Owner" && role !== "SuperAdmin") {
    return <Navigate to="/home" replace />;
  }
  return <Shell auth={auth.user}>{children}</Shell>;
}

function OwnerOnlyRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Checking session...</div>;
  }
  if (!auth.user || auth.isUnauthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (String(auth.user.role ?? "") !== "Owner") {
    return <Navigate to="/home" replace />;
  }
  return <Shell auth={auth.user}>{children}</Shell>;
}

function HomeRoute() {
  const auth = useAuth();
  if (!auth.user) return null;
  return <HomePage auth={auth.user} />;
}

function ArrivingSoonRoute() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  if (!operatingCompanyId) return <ComingSoonPage />;
  return <ArrivingSoonPage operatingCompanyId={operatingCompanyId} />;
}

export default function App() {
  return (
    <CompanyProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/reset" element={<LoginResetRequestPage />} />
        <Route path="/login/reset/confirm" element={<LoginResetConfirmPage />} />
        <Route path="/legal/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/legal/terms" element={<TermsOfServicePage />} />
        <Route path="/sign/:token" element={<LegalSignPage />} />
        <Route path="/attorney-review/:token" element={<LegalAttorneyReviewPortalPage />} />
        <Route path="/owner-approval/:token" element={<OwnerApprovalPortalPage />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomeRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/notifications"
          element={
            <ProtectedRoute>
              <NotificationPreferencesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <UserProfileSettingsPage />
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
              <SuspenseShell>
                <CustomersListPage />
              </SuspenseShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <ProtectedRoute>
              <SuspenseShell>
                <AccountingCustomerDetailPage />
              </SuspenseShell>
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
          path="/dispatch/alerts"
          element={
            <ProtectedRoute>
              <DispatchAlertsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch"
          element={
            <ProtectedRoute>
              <DispatchPage />
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
          path="/banking/transfers"
          element={
            <ProtectedRoute>
              <TransfersListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/reconcile"
          element={
            <ProtectedRoute>
              <BankingObligationReconcilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/reconciliation"
          element={
            <ProtectedRoute>
              <BankingReconciliationListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/reconciliation/sessions/:sessionId"
          element={
            <ProtectedRoute>
              <BankingReconciliationSessionRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/reconciliation/workspace"
          element={
            <ProtectedRoute>
              <ReconciliationWorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/rules"
          element={
            <ProtectedRoute>
              <BankingRulesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/transactions"
          element={
            <ProtectedRoute>
              <BankingTransactionsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/categorization-rules"
          element={
            <ProtectedRoute>
              <CategorizationRulesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/qbo-sync-queue"
          element={
            <ProtectedRoute>
              <QboSyncQueuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/email-queue"
          element={
            <ProtectedRoute>
              <EmailQueuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/accounts/:id"
          element={
            <ProtectedRoute>
              <BankAccountDetailPage />
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
          {/* Block K (Driver Scheduler): canonical paths under /safety/* — see IH35_UNIFIED_BLUEPRINT_ADDITIONS.md §14 */}
          <Route path="driver-scheduler" element={<DriverSchedulerGridPage />} />
          <Route path="scheduler/pending-requests" element={<DriverSchedulerRequestInboxPage />} />
          <Route path="scheduler/requests/:id" element={<DriverSchedulerRequestDetailPage />} />
          <Route path="leave-balances" element={<DriverLeaveBalancesPage />} />
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
          path="/maintenance/work-orders/:id"
          element={
            <ProtectedRoute>
              <WorkOrderDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/work-orders"
          element={
            <ProtectedRoute>
              <Navigate to="/maintenance" replace />
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
          path="/maintenance/arriving-soon"
          element={
            <ProtectedRoute>
              <ArrivingSoonRoute />
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
          path="/driver-finance/cash-advance-requests"
          element={
            <ProtectedRoute>
              <CashAdvanceRequestsPage />
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
          path="/work-orders"
          element={
            <ProtectedRoute>
              <WorkOrdersConsoleListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/work-orders/:id"
          element={
            <ProtectedRoute>
              <WorkOrdersConsoleDetailPage />
            </ProtectedRoute>
          }
        />
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
        <Route
          path="/lists/driver/pay-rate-templates"
          element={
            <ProtectedRoute>
              <PayRateTemplatesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/driver/teams"
          element={
            <ProtectedRoute>
              <DriverTeamsPage />
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
        <Route
          path="/lists/maintenance/failure-codes"
          element={
            <ProtectedRoute>
              <MaintenanceFailureCodesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/maintenance/labor-codes"
          element={
            <ProtectedRoute>
              <MaintenanceLaborCodesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/maintenance/parts"
          element={
            <ProtectedRoute>
              <MaintenancePartsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/maintenance/priority-levels"
          element={
            <ProtectedRoute>
              <MaintenancePriorityLevelsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/maintenance/service-tasks"
          element={
            <ProtectedRoute>
              <MaintenanceServiceTasksListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/maintenance/shop-locations"
          element={
            <ProtectedRoute>
              <MaintenanceShopLocationsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/maintenance/vendors"
          element={
            <ProtectedRoute>
              <MaintenanceVendorsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/maintenance/work-order-statuses"
          element={
            <ProtectedRoute>
              <WorkOrderStatusesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/card-types"
          element={
            <ProtectedRoute>
              <FuelCardTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/exception-types"
          element={
            <ProtectedRoute>
              <FuelExceptionTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/station-brands"
          element={
            <ProtectedRoute>
              <FuelStationBrandsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/stop-reason-codes"
          element={
            <ProtectedRoute>
              <FuelStopReasonCodesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/mpg-bands"
          element={
            <ProtectedRoute>
              <MpgBandsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/expensive-states"
          element={
            <ProtectedRoute>
              <ExpensiveStatesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/tax-jurisdictions"
          element={
            <ProtectedRoute>
              <FuelTaxJurisdictionsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/brands"
          element={
            <ProtectedRoute>
              <FuelBrandsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/station-states"
          element={
            <ProtectedRoute>
              <FuelStationStatesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/pump-types"
          element={
            <ProtectedRoute>
              <FuelPumpTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/grades"
          element={
            <ProtectedRoute>
              <FuelGradesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fuel/dispatch-routes"
          element={
            <ProtectedRoute>
              <FuelDispatchRoutesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fleet/tractor-statuses"
          element={
            <ProtectedRoute>
              <TractorStatusesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fleet/trailer-statuses"
          element={
            <ProtectedRoute>
              <TrailerStatusesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fleet/condition-codes"
          element={
            <ProtectedRoute>
              <ConditionCodesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fleet/equipment-types"
          element={
            <ProtectedRoute>
              <EquipmentTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fleet/tire-positions"
          element={
            <ProtectedRoute>
              <TirePositionsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fleet/ownership-types"
          element={
            <ProtectedRoute>
              <OwnershipTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fleet/trailer-types"
          element={
            <ProtectedRoute>
              <TrailerTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fleet/lease-terms"
          element={
            <ProtectedRoute>
              <LeaseTermsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fleet/asset-statuses"
          element={
            <ProtectedRoute>
              <AssetStatusesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/fleet/asset-locations"
          element={
            <ProtectedRoute>
              <AssetLocationsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/chart-of-accounts"
          element={
            <ProtectedRoute>
              <ChartOfAccountsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/classes"
          element={
            <ProtectedRoute>
              <ClassesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/payment-terms"
          element={
            <ProtectedRoute>
              <PaymentTermsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/posting-templates"
          element={
            <ProtectedRoute>
              <PostingTemplatesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/journal-entry-types"
          element={
            <ProtectedRoute>
              <JournalEntryTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/qbo-bulk-link"
          element={
            <ProtectedRoute>
              <QBOBulkLinkPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/qbo-categories"
          element={
            <ProtectedRoute>
              <QboCategoriesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/items"
          element={
            <ProtectedRoute>
              <ItemsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/account-role-bindings"
          element={
            <ProtectedRoute>
              <AccountRoleBindingsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/chart-of-accounts-seeds"
          element={
            <ProtectedRoute>
              <ChartOfAccountsSeedsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/expense-categories"
          element={
            <ProtectedRoute>
              <ExpenseCategoriesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/payment-methods"
          element={
            <ProtectedRoute>
              <PaymentMethodsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/tax-codes"
          element={
            <ProtectedRoute>
              <TaxCodesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/accounting/abandonment-defaults"
          element={
            <OwnerAdminRoute>
              <AbandonmentDefaultsPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/lists/accounting/currency-codes"
          element={
            <ProtectedRoute>
              <CurrencyCodesListPage />
            </ProtectedRoute>
          }
        />
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
          path="/integrations/samsara"
          element={
            <OwnerOnlyRoute>
              <SamsaraIntegrationPage />
            </OwnerOnlyRoute>
          }
        />
        <Route
          path="/help"
          element={
            <ProtectedRoute>
              <HelpCenterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/help/:slug"
          element={
            <ProtectedRoute>
              <HelpArticlePage />
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
          path="/reports/ar-aging"
          element={
            <ProtectedRoute>
              <ARAgingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/ap-aging"
          element={
            <ProtectedRoute>
              <APAgingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/cash-flow-overview"
          element={
            <ProtectedRoute>
              <CashFlowOverviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/settlement-summary"
          element={
            <ProtectedRoute>
              <SettlementSummaryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/customer-profitability"
          element={
            <ProtectedRoute>
              <CustomerProfitabilityPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/profit-per-truck"
          element={
            <ProtectedRoute>
              <ProfitPerTruckPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/qbo/sync-dashboard"
          element={
            <ProtectedRoute>
              <QBOSyncStatusDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/fuel-reconciliation"
          element={
            <ProtectedRoute>
              <FuelReconciliationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/maintenance-cost-per-unit"
          element={
            <ProtectedRoute>
              <MaintenanceCostPerUnitPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/scheduled"
          element={
            <ProtectedRoute>
              <ScheduledReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/legal"
          element={
            <OwnerAdminRoute>
              <LegalLandingPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/legal/contracts"
          element={
            <OwnerAdminRoute>
              <LegalContractInstancesPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/legal/templates"
          element={
            <OwnerAdminRoute>
              <LegalTemplatesListPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/legal/templates/:id"
          element={
            <OwnerAdminRoute>
              <LegalTemplateDetailPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/legal/policies"
          element={
            <OwnerAdminRoute>
              <LegalPoliciesPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/legal/matters"
          element={
            <ProtectedRoute>
              <LegalMattersListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/legal/matters/new"
          element={
            <ProtectedRoute>
              <LegalMatterNewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/legal/matters/:id"
          element={
            <ProtectedRoute>
              <LegalMatterDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/legal/reports"
          element={
            <ProtectedRoute>
              <LegalReportsLandingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/legal/attorney-review"
          element={
            <OwnerAdminRoute>
              <LegalAttorneyReviewPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/admin/data-import"
          element={
            <OwnerAdminRoute>
              <DataImportPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/admin/forensic-review"
          element={
            <OwnerAdminRoute>
              <ForensicReviewPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/admin/activity"
          element={
            <OwnerSuperAdminRoute>
              <ActivityLogPage />
            </OwnerSuperAdminRoute>
          }
        />
        <Route
          path="/admin/migration-status"
          element={
            <OwnerOnlyRoute>
              <MigrationStatusPage />
            </OwnerOnlyRoute>
          }
        />
        <Route
          path="/admin/error-monitor"
          element={
            <OwnerOnlyRoute>
              <ErrorMonitorPage />
            </OwnerOnlyRoute>
          }
        />
        <Route
          path="/admin/integrity"
          element={
            <OwnerOnlyRoute>
              <IntegrityAdminPage />
            </OwnerOnlyRoute>
          }
        />
        <Route
          path="/admin/sync"
          element={
            <OwnerOnlyRoute>
              <AdminSyncHealthPage />
            </OwnerOnlyRoute>
          }
        />
        <Route
          path="/accounting"
          element={
            <ProtectedRoute>
              <AccountingHubPage />
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
          path="/accounting/dispute-queue"
          element={
            <ProtectedRoute>
              <DisputeQueuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/abandonment-queue"
          element={
            <ProtectedRoute>
              <AbandonmentQueuePage />
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
          path="/accounting/bills"
          element={
            <ProtectedRoute>
              <BillsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/bills/vendor"
          element={
            <ProtectedRoute>
              <VendorBillCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/expenses"
          element={
            <ProtectedRoute>
              <ExpenseCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/period-close"
          element={
            <ProtectedRoute>
              <PeriodClosePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/reports"
          element={
            <ProtectedRoute>
              <AccountingReportsWave2Page />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/sync-conflicts"
          element={
            <ProtectedRoute>
              <AccountingSyncConflictsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/sync-conflicts/:conflictId"
          element={
            <ProtectedRoute>
              <AccountingSyncConflictRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/sales-tax"
          element={
            <ProtectedRoute>
              <AccountingSalesTaxPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/1099"
          element={
            <ProtectedRoute>
              <Accounting1099Page />
            </ProtectedRoute>
          }
        />
        {[
          "/dispatch/loads",
          "/dispatch/geofencing",
          "/dispatch/factoring-packets",
          "/dispatch/incidents",
          "/maintenance/work-orders",
          "/maintenance/parts-inventory",
          "/maintenance/severe-repairs",
          "/maintenance/triage",
          "/maintenance/in-transit",
          "/fuel/planner",
          "/fuel/settings",
          "/fuel/inbox",
          "/safety/accidents-incidents",
          "/safety/integrity-alerts",
          "/safety/permits",
          "/safety/trailer-interchanges",
          "/drivers/settlements",
          "/drivers/permits",
          "/accounting/bill-payments",
          "/accounting/vendor-balances",
          "/accounting/journal-entries",
          "/factoring/faro-imports",
          "/factoring/equipment-loans",
          "/factoring/vendor-merges",
        ].map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute>
                <ComingSoonPage />
              </ProtectedRoute>
            }
          />
        ))}
        <Route
          path="/reports/run/:reportId"
          element={
            <ProtectedRoute>
              <ReportsRunnerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver-app"
          element={
            <ProtectedRoute>
              <DriverAppLandingPage />
            </ProtectedRoute>
          }
        />
        <Route path="/pwa/fuel-receipt" element={<DriverShell />}>
          <Route index element={<FuelReceiptPage />} />
        </Route>
        <Route path="/driver/login" element={<DriverLoginPage />} />
        <Route path="/driver" element={<DriverShell />}>
          <Route index element={<Navigate to="loads" replace />} />
          <Route path="loads" element={<DriverLoadsPage />} />
          <Route path="loads/:id" element={<DriverLoadDetailPage />} />
          <Route path="hos" element={<DriverHosPage />} />
          <Route path="disputes" element={<DisputesPage />} />
          <Route path="settings" element={<DriverSettingsPage />} />
        </Route>
        {[
          // Keep only truly unshipped module redirects here.
          // Shipped modules (Factoring, 425C, Lists) must never be routed via /coming-soon.
          ["/accounting", "Accounting", "5", "Post-launch"],
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
        <Route
          path="/fleet/units/:id"
          element={
            <ProtectedRoute>
              <AssetProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CompanyProvider>
  );
}
