import { MapView } from "../pages/dispatch/MapView";
import React from "react";
import { Navigate, Route, useLocation, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/useAuth";
import { useCompanyContext } from "../contexts/CompanyContext";
import { Shell } from "../components/Shell";
import { CustomersPage } from "../pages/Customers";
import { CustomerDetailPage } from "../pages/CustomerDetail";
import { ListsHubPage } from "../pages/lists/ListsHubPage";
import { NamesMasterHub } from "../pages/lists/names/NamesMasterHub";
import { BrokersListPage } from "../pages/lists/names/BrokersListPage";
import { DriverDetailPage } from "../pages/DriverDetail";
import { DriverProfilePage } from "../pages/drivers/DriverProfilePage";
import { DriverHosDetailPage } from "../pages/drivers/DriverHosDetailPage";
import { MessagesInboxPage } from "../pages/drivers/MessagesInboxPage";
import { DocumentAlertsPage } from "../pages/alerts/DocumentAlertsPage";
import { OnboardingWizardPage } from "../pages/drivers/OnboardingWizardPage";
import { ApplicantsPipelinePage } from "../pages/drivers/ApplicantsPipelinePage";
import { ApplicationPage } from "../pages/public/ApplicationPage";
import { DriverLoadStatusesPage } from "../pages/DriverLoadStatusesPage";
import { DriversPage } from "../pages/drivers/DriversPage";
import { RetentionDashboard } from "../pages/drivers/RetentionDashboard";
import type { DriversSubnavId } from "../components/drivers/DRIVERS_TABS_CONFIG";
import { DispatchPage } from "../pages/Dispatch";
import { GeofencesPage } from "../pages/operations/GeofencesPage";
import { DispatchAlertsPage } from "../pages/dispatch/DispatchAlertsPage";
import { LateArrivalsPage } from "../pages/dispatch/LateArrivalsPage";
import { AtRiskQueuePage } from "../pages/dispatch/AtRiskQueuePage";
import { FactoringQueuePage } from "../pages/dispatch/FactoringQueuePage";
import { InTransitIssuesPage } from "../pages/dispatch/InTransitIssuesPage";
import { AssignmentHistoryPage } from "../pages/dispatch/AssignmentHistoryPage";
import { PlannerCalendarPage } from "../pages/dispatch/PlannerCalendarPage";
import { DispatchPlannersLayout } from "../pages/dispatch/planners/DispatchPlannersLayout";
import { UnifiedTimelinePlanner } from "../pages/dispatch/planners/UnifiedTimelinePlanner";
import { DriverPlanner } from "../pages/dispatch/planners/DriverPlanner";
import { TruckPlanner } from "../pages/dispatch/planners/TruckPlanner";
import { LoadsPlanner } from "../pages/dispatch/planners/LoadsPlanner";
import { DetentionBoardPage } from "../pages/dispatch/DetentionBoardPage";
import { EquipmentTransferRequestsPage } from "../pages/dispatch/EquipmentTransferRequests";
import { OcrQueuePage } from "../pages/dispatch/OcrQueuePage";
import { NotifyPreferencesPage } from "../pages/dispatch/NotifyPreferencesPage";
import { PodReviewPage } from "../pages/dispatch/PodReviewPage";
import { DispatchSettingsPage } from "../pages/dispatch/DispatchSettingsPage";
import { BorderCrossingWizardPage } from "../pages/dispatch/BorderCrossingWizardPage";
import { BorderCrossingHistoryPage } from "../pages/dispatch/BorderCrossingHistoryPage";
import { BorderCrossingHistory as GpsBorderCrossingHistory } from "../pages/dispatch/borders/BorderCrossingHistory";
import { SettlementsPage } from "../pages/driver-finance/SettlementsPage";
import { CashAdvanceRequestsPage } from "../pages/driver-finance/CashAdvanceRequestsPage";
import { OwnerApprovalPortalPage } from "../pages/driver-finance/OwnerApprovalPortalPage";
import { PortalLayout } from "../portal/PortalLayout";
import { PortalLoginPage } from "../portal/PortalLoginPage";
import { PortalDashboardPage } from "../portal/PortalDashboardPage";
import { PortalLoadDetailPage } from "../portal/PortalLoadDetailPage";
import { PortalProfilePage } from "../portal/PortalProfilePage";
import { PortalRouteGuard } from "../portal/PortalRouteGuard";
import { FuelPlannerHomePage, type FuelTabId } from "../pages/fuel/FuelPlannerHome";
import { BankingHomePage } from "../pages/banking/BankingHome";
import { TransfersListPage } from "../pages/banking/TransfersListPage";
import { BankingObligationReconcilePage } from "../pages/banking/BankingObligationReconcilePage";
import { ReconciliationWorkspacePage } from "../pages/banking/ReconciliationWorkspace";
import { BankReconciliationPage } from "../pages/banking/BankReconciliationPage";
import { CategorizationRulesPage } from "../pages/banking/CategorizationRulesPage";
import { QboSyncQueuePage } from "../pages/banking/QboSyncQueuePage";
import { EmailQueuePage } from "../pages/banking/EmailQueuePage";
import { BankAccountDetailPage } from "../pages/banking/BankAccountDetail";
import { SafetyLayout } from "../pages/safety/SafetyLayout";
import { EldAuditTrailViewer } from "../pages/safety/eld/EldAuditTrailViewer";
import {
  AccidentsIncidentsTab,
  CargoClaimsTab,
  ComplaintsTab,
  CSAScoreTab,
  DamageReportsTab,
  DOTComplianceTab,
  SafetyEventsTab,
  DOTInspectionsTab,
  DriverScoringTab,
  DriverFilesTab,
  DrugAlcoholTab,
  EscrowRecordTab,
  ExternalFinesTab,
  GeofenceBreachesTab,
  HOSViolationsTab,
  HoursOfServiceTab,
  IDVRTab,
  IntegrityReportsTab,
  PositionHistoryPage,
  InsuranceTab,
  InternalFinesTab,
  PermitsTab,
  SafetyMeetingsTab,
  SettingsTab,
  TrailerInterchangesTab,
} from "../pages/safety/tabs";
import { LiabilitiesHomePage } from "../pages/liabilities/LiabilitiesHome";
import { MaintenanceHomePage, MaintenanceShell } from "../pages/maintenance/MaintenanceHome";
import type { MaintenanceTabId } from "../pages/maintenance/MaintenanceHome";
import { WorkOrdersConsoleDetailPage } from "../pages/work-orders/WorkOrdersConsoleDetailPage";
import { WorkOrdersConsoleListPage } from "../pages/work-orders/WorkOrdersConsoleListPage";
import { WorkOrderDetailPage } from "../pages/maintenance/WorkOrderDetailPage";
import { WorkOrderNewPage } from "../pages/maintenance/WorkOrderNewPage";
import { DefectsInboxPage } from "../pages/maintenance/DefectsInboxPage";
import { DefectDetailPage } from "../pages/maintenance/DefectDetailPage";
import { VehiclesMasterDataPage } from "../pages/maintenance/vehicles/VehiclesMasterDataPage";
import { DriversMasterDataPage } from "../pages/maintenance/drivers/DriversMasterDataPage";
import { PartsMasterDataPage } from "../pages/maintenance/parts/PartsMasterDataPage";
import { PmSchedulePage } from "../pages/maintenance/pm-schedule/PmSchedulePage";
import { PmAutoEnginePage } from "../pages/maintenance/PmAutoEnginePage";
import { MaintKpiDashboardPage } from "../pages/maintenance/MaintKpiDashboardPage";
import { InspectionsPage } from "../pages/maintenance/inspections/InspectionsPage";
import { TireProgramPage } from "../pages/maintenance/TireProgramPage";
import { WarrantyClaimsPage } from "../pages/maintenance/WarrantyClaimsPage";
import { VendorsPage as MaintenanceVendorsPage } from "../pages/maintenance/vendors/VendorsPage";
import { VendorDetailPage as MaintenanceVendorDetailPage } from "../pages/maintenance/VendorDetailPage";
import { MaintenanceReportsPage } from "../pages/maintenance/reports/MaintenanceReportsPage";
import { Compliance425CPage } from "../pages/maintenance/compliance/Compliance425CPage";
import { CashAdvancesHomePage } from "../pages/cash-advances/CashAdvancesHome";
import { FactoringHomePage } from "../pages/factoring/FactoringHome";
import { BatchWizard } from "../pages/factoring/BatchWizard";
import { BatchDetail } from "../pages/factoring/BatchDetail";
import { FactorAdmin } from "../pages/factoring/FactorAdmin";
import { ReserveDashboard } from "../pages/factoring/ReserveDashboard";
import { FaroImportPage } from "../pages/factoring/FaroImportPage";
import { VehicleProfilePage } from "../pages/fleet/VehicleProfilePage";
import { FleetHomePage } from "../pages/fleet/FleetHomePage";
import { TrailerProfilePage } from "../pages/fleet/TrailerProfilePage";
import { TransfersInProgressPage } from "../pages/fleet/TransfersInProgressPage";
import { ComplianceDashboardPage } from "../pages/compliance/ComplianceDashboardPage";
import { NotificationCenterPage } from "../pages/notifications/NotificationCenterPage";
import { EquipmentTypesPage } from "../pages/EquipmentTypesPage";
import { HomePage } from "../pages/Home";
import { OwnerHome } from "../pages/home/OwnerHome";
import { QboStyleHomePage } from "../pages/home/QboStyleHomePage";
import { LoginPage } from "../pages/Login";
import { LoginResetRequestPage } from "../pages/LoginResetRequestPage";
import { LoginResetConfirmPage } from "../pages/LoginResetConfirmPage";
import { ComingSoonPage } from "../pages/ComingSoonPage";
import { BulkDemoPage } from "../pages/dev/BulkDemoPage";
import { SamsaraIntegrationPage } from "../pages/integrations/SamsaraIntegrationPage";
import { DriverAppLandingPage } from "../pages/DriverAppLandingPage";
import { DisputesPage } from "../pages/driver/DisputesPage";
import { DriverShell } from "../pages/driver/DriverShell";
import { DriverLoginPage } from "../pages/driver/DriverLoginPage";
import { DriverLoadsPage } from "../pages/driver/DriverLoadsPage";
import { DriverLoadDetailPage } from "../pages/driver/DriverLoadDetailPage";
import { DriverHosPage } from "../pages/driver/DriverHosPage";
import { DriverSettingsPage } from "../pages/driver/DriverSettingsPage";
import { FuelReceiptPage } from "../pages/driver/FuelReceiptPage";
import { NotificationPreferencesPage } from "../pages/settings/NotificationPreferencesPage";
import { UserProfileSettingsPage } from "../pages/settings/UserProfileSettingsPage";
import { DocumentsPage } from "../pages/Documents";
import { DocsHomePage } from "../pages/docs/DocsHomePage";
import { EldPage } from "../pages/eld/EldPage";
import { CashFlowPage } from "../pages/cash-flow/CashFlowPage";
import { DriverHubPage } from "../pages/home/DriverHubPage";
import { DriverHubReportingPage } from "../pages/home/DriverHubReportingPage";
import { UserDetailPage } from "../pages/UserDetail";
import { UsersPage } from "../pages/Users";
import { VendorsPage } from "../pages/Vendors";
import { VendorDetailPage } from "../pages/VendorDetail";
import { Form425CHome } from "../pages/form425c/Form425CHome";
import { HelpCenterPage } from "../pages/help/HelpCenterPage";
import { HelpArticlePage } from "../pages/help/HelpArticlePage";
import { HelpPage } from "../pages/help/HelpPage";
import { RunbooksIndex } from "../pages/help/RunbooksIndex";
import { OnboardingWizard } from "../pages/onboarding/OnboardingWizard";
import { ReportsHomePage } from "../pages/reports/ReportsHome";
import IFTAPreparer from "../pages/reports/ifta/IFTAPreparer";
import IftaPreparer from "../pages/reports/tax-regulatory/IftaPreparer";
import { ReportsRunnerPage } from "../pages/reports/ReportsRunner";
import { ARAgingPage } from "../pages/reports/ARAgingPage";
import { APAgingPage } from "../pages/reports/APAgingPage";
import { TrialBalancePage } from "../pages/reports/TrialBalancePage";
import { ProfitLossPage } from "../pages/reports/ProfitLossPage";
import { BalanceSheetPage } from "../pages/reports/BalanceSheetPage";
import { CashFlowStatementPage } from "../pages/reports/CashFlowStatementPage";
import { CashFlowOverviewPage } from "../pages/reports/CashFlowOverviewPage";
import { CashFlowReport } from "../pages/reports/CashFlowReport";
import { PerTruckCpmReport } from "../pages/reports/PerTruckCpmReport";
import { SettlementSummaryPage } from "../pages/reports/SettlementSummaryPage";
import { CustomerProfitabilityPage } from "../pages/reports/CustomerProfitabilityPage";
import { ProfitPerTruckPage } from "../pages/reports/ProfitPerTruckPage";
import { LaneProfitabilityPage } from "../pages/reports/LaneProfitabilityPage";
import { CancellationsReportPage } from "../pages/reports/CancellationsReportPage";
import { FuelReconciliationPage } from "../pages/reports/FuelReconciliationPage";
import { MaintenanceCostPerUnitPage } from "../pages/reports/MaintenanceCostPerUnitPage";
import { DispatchMarginPage } from "../pages/reports/DispatchMarginPage";
import { SubscriptionManager } from "../pages/reports/SubscriptionManager";
import { GeofenceDwellReport } from "../pages/reports/GeofenceDwellReport";
import { GeofenceReconciliationReport } from "../pages/reports/GeofenceReconciliationReport";
import BookingGapReport from "../pages/reports/BookingGapReport";
import { FaultDraftsPage } from "../pages/maintenance/FaultDraftsPage";
import { FaultRulesPage } from "../pages/maintenance/FaultRulesPage";
import { DeadheadReportPage } from "../pages/reports/DeadheadReportPage";
import { AuditActivityByUserPage } from "../pages/reports/audit/AuditActivityByUserPage";
import { AuditActivityByModulePage } from "../pages/reports/audit/AuditActivityByModulePage";
import { AuditFinancialChangeLogPage } from "../pages/reports/audit/AuditFinancialChangeLogPage";
import { AuditMaintenanceDecisionLogPage } from "../pages/reports/audit/AuditMaintenanceDecisionLogPage";
import { AuditDeductionTrailPage } from "../pages/reports/audit/AuditDeductionTrailPage";
import { AuditVoidReversalPage } from "../pages/reports/audit/AuditVoidReversalPage";
import { AuditPeriodCloseHistoryPage } from "../pages/reports/audit/AuditPeriodCloseHistoryPage";
import { QboSyncDetailPage } from "../pages/qbo-sync-detail/QboSyncDetailPage";
import { InvoicesListPage } from "../pages/accounting/InvoicesListPage";
import { TransactionRegisterPage } from "../pages/accounting/TransactionRegisterPage";
import { MultiEntityAccountingPage } from "../pages/accounting/MultiEntityAccountingPage";
import { AccountingHubPage } from "../pages/accounting/AccountingHubPage";
import { DisputeQueuePage } from "../pages/accounting/DisputeQueuePage";
import { AbandonmentQueuePage } from "../pages/accounting/AbandonmentQueuePage";
import { InvoiceDetailPage } from "../pages/accounting/InvoiceDetailPage";
import { PaymentsListPage } from "../pages/accounting/PaymentsListPage";
import { PaymentDetailPage } from "../pages/accounting/PaymentDetailPage";
import { FactoringListPage } from "../pages/accounting/FactoringListPage";
import { FactoringDetailPage } from "../pages/accounting/FactoringDetailPage";
import { FactorReconciliationPage } from "../pages/accounting/FactorReconciliationPage";
import { ReconciliationWorkspacePage as AccountingReconciliationWorkspacePage } from "../pages/accounting/ReconciliationWorkspacePage";
import { VendorBillCreatePage } from "../pages/accounting/VendorBillCreatePage";
import { CreateMultipleBillsPage } from "../pages/accounting/CreateMultipleBillsPage";
import { ExpenseCreatePage } from "../pages/accounting/ExpenseCreatePage";
import { BillsPage } from "../pages/accounting/BillsPage";
import { VendorBalancesPage } from "../pages/accounting/VendorBalancesPage";
import { ManualJEListPage } from "../pages/accounting/ManualJEListPage";
import { BillPaymentsListPage } from "../pages/accounting/BillPaymentsListPage";
import { JournalEntryDetailPage } from "../pages/accounting/journal-entries/JournalEntryDetailPage";
import { AccountRegisterPage } from "../pages/accounting/AccountRegisterPage";
import { AccountingPreSettlementsPage } from "../pages/accounting/AccountingPreSettlementsPage";
import { PayrollAggregatedPage } from "../pages/accounting/PayrollAggregatedPage";
import { ExpenseCategoryMapPage } from "../pages/accounting/ExpenseCategoryMapPage";
import { CoaRolesPage } from "../pages/accounting/CoaRolesPage";
import { DailyReconPage } from "../pages/accounting/DailyReconPage";
import { SalesTaxPage } from "../pages/accounting/SalesTaxPage";
import { AccountingAuditTrailPage } from "../pages/accounting/AccountingAuditTrailPage";
import { PostingLineagePage } from "../pages/accounting/PostingLineagePage";
import { MonthClosePage } from "../pages/accounting/MonthClosePage";
import { EscrowPage } from "../pages/accounting/EscrowPage";
import { CashForecastPage } from "../pages/accounting/CashForecastPage";
import { PeriodComparisonPage } from "../pages/accounting/PeriodComparisonPage";
import { QBOSyncDriftDashboard } from "../pages/accounting/QBOSyncDriftDashboard";
import { COLLECTIONS_ROUTE } from "./collections.routes";
import { TRIP_PAIRING_BOARD_ROUTE } from "./trip-pairing-board.routes";
import { AP_AGING_ROUTE } from "./ap-aging.routes";
import { resolveUnderscoreRedirectPath } from "./url-canonicalize";
import { ForensicReviewPage } from "../pages/forensic/ForensicReviewPage";
import { ActivityLogPage } from "../pages/admin/ActivityLogPage";
import AuditEventsList from "../pages/audit/AuditEventsList";
import AuditLogViewer from "../pages/admin/audit-log/AuditLogViewer";
import AuditTrailPage from "../pages/audit/AuditTrailPage";
import { MigrationStatusPage } from "../pages/admin/MigrationStatus";
import { ErrorMonitorPage } from "../pages/admin/ErrorMonitor";
import { IntegrityAdminPage } from "../pages/admin/IntegrityAdminPage";
import { DataImportPage } from "../pages/admin/DataImportPage";
import { CarrierBootstrapPage } from "../pages/admin/CarrierBootstrap";
import { LaunchTogglesPage } from "../pages/admin/LaunchToggles";
import { FeatureFlagsManager } from "../pages/admin/feature-flags/FeatureFlagsManager";
import { ObservabilityPage } from "../pages/admin/ObservabilityPage";
import { MobileAuditReport } from "../pages/admin/mobile-audit/MobileAuditReport";
import { AccountRoleBindingsListPage } from "../pages/lists/accounting/AccountRoleBindingsListPage";
import { ChartOfAccountsListPage } from "../pages/lists/accounting/ChartOfAccountsListPage";
import { ChartOfAccountsSeedsListPage } from "../pages/lists/accounting/ChartOfAccountsSeedsListPage";
import { ClassesListPage } from "../pages/lists/accounting/ClassesListPage";
import { CurrencyCodesListPage } from "../pages/lists/accounting/CurrencyCodesListPage";
import { ExpenseCategoriesListPage } from "../pages/lists/accounting/ExpenseCategoriesListPage";
import { ItemsListPage } from "../pages/lists/accounting/ItemsListPage";
import { JournalEntryTypesListPage } from "../pages/lists/accounting/JournalEntryTypesListPage";
import { PaymentTermsListPage } from "../pages/lists/accounting/PaymentTermsListPage";
import { PaymentMethodsListPage } from "../pages/lists/accounting/PaymentMethodsListPage";
import { PostingTemplatesListPage } from "../pages/lists/accounting/PostingTemplatesListPage";
import { QBOBulkLinkPage } from "../pages/lists/accounting/QBOBulkLinkPage";
import { QboCategoriesListPage } from "../pages/lists/accounting/QboCategoriesListPage";
import { TaxCodesListPage } from "../pages/lists/accounting/TaxCodesListPage";
import { AbandonmentDefaultsPage } from "../pages/lists/accounting/AbandonmentDefaultsPage";
import { AdditionalChargesListPage } from "../pages/lists/dispatch/AdditionalChargesListPage";
import { DetentionReasonsListPage } from "../pages/lists/dispatch/DetentionReasonsListPage";
import { LoadCancellationReasonsListPage } from "../pages/lists/dispatch/LoadCancellationReasonsListPage";
import { LoadTypesListPage } from "../pages/lists/dispatch/LoadTypesListPage";
import { PickupTimeTypesListPage } from "../pages/lists/dispatch/PickupTimeTypesListPage";
import { DriverDeductionTypesListPage } from "../pages/lists/driver/DriverDeductionTypesListPage";
import { DriverPayTypesListPage } from "../pages/lists/driver/DriverPayTypesListPage";
import { DriverTeamsPage } from "../pages/lists/driver/DriverTeamsPage";
import { EscrowTypesListPage } from "../pages/lists/driver/EscrowTypesListPage";
import { PayRateTemplatesListPage } from "../pages/lists/driver/PayRateTemplatesListPage";
import {
  CdlEndorsementsListPage,
  CdlRestrictionsListPage,
  EmploymentStatusesListPage,
  LicenseClassesListPage,
  MedicalCardStatusesListPage,
} from "../pages/lists/driver/deprecated-subcatalog-pages";
import { Catalog as DriversLicenseClassesCatalog } from "../pages/lists/drivers/license-classes/Catalog";
import { Catalog as DriversEndorsementsCatalog } from "../pages/lists/drivers/endorsements/Catalog";
import { Catalog as DriversRestrictionsCatalog } from "../pages/lists/drivers/restrictions/Catalog";
import { Catalog as DriversMedicalCardStatusCatalog } from "../pages/lists/drivers/medical-card-status/Catalog";
import { Catalog as DriversEmploymentStatusCatalog } from "../pages/lists/drivers/employment-status/Catalog";
import { TerminationReasonsListPage } from "../pages/lists/drivers/TerminationReasonsListPage";
import { ConditionCodesListPage } from "../pages/lists/fleet/ConditionCodesListPage";
import { AssetLocationsListPage } from "../pages/lists/fleet/AssetLocationsListPage";
import { AssetStatusesListPage } from "../pages/lists/fleet/AssetStatusesListPage";
import { EquipmentTypesListPage } from "../pages/lists/fleet/EquipmentTypesListPage";
import { LeaseTermsListPage } from "../pages/lists/fleet/LeaseTermsListPage";
import { OwnershipTypesListPage } from "../pages/lists/fleet/OwnershipTypesListPage";
import { TirePositionsListPage } from "../pages/lists/fleet/TirePositionsListPage";
import { TractorStatusesListPage } from "../pages/lists/fleet/TractorStatusesListPage";
import { TrailerStatusesListPage } from "../pages/lists/fleet/TrailerStatusesListPage";
import { TrailerTypesListPage } from "../pages/lists/fleet/TrailerTypesListPage";
import { ExpensiveStatesListPage } from "../pages/lists/fuel/ExpensiveStatesListPage";
import { FuelBrandsListPage } from "../pages/lists/fuel/FuelBrandsListPage";
import { FuelCardTypesListPage } from "../pages/lists/fuel/FuelCardTypesListPage";
import { FuelExceptionTypesListPage } from "../pages/lists/fuel/FuelExceptionTypesListPage";
import { FuelGradesListPage } from "../pages/lists/fuel/FuelGradesListPage";
import { FuelStationBrandsListPage } from "../pages/lists/fuel/FuelStationBrandsListPage";
import { FuelStopReasonCodesListPage } from "../pages/lists/fuel/FuelStopReasonCodesListPage";
import { FuelTaxJurisdictionsListPage } from "../pages/lists/fuel/FuelTaxJurisdictionsListPage";
import { FuelDispatchRoutesListPage } from "../pages/lists/fuel/FuelDispatchRoutesListPage";
import { FuelPumpTypesListPage } from "../pages/lists/fuel/FuelPumpTypesListPage";
import { FuelStationStatesListPage } from "../pages/lists/fuel/FuelStationStatesListPage";
import { MpgBandsListPage } from "../pages/lists/fuel/MpgBandsListPage";
import { MaintenanceFailureCodesListPage } from "../pages/lists/maintenance/MaintenanceFailureCodesListPage";
import { MaintenanceLaborCodesListPage } from "../pages/lists/maintenance/MaintenanceLaborCodesListPage";
import { MaintenancePartsListPage } from "../pages/lists/maintenance/MaintenancePartsListPage";
import { OemPartsCatalog } from "../pages/lists/maintenance/OemPartsCatalog";
import { MaintenancePriorityLevelsListPage } from "../pages/lists/maintenance/MaintenancePriorityLevelsListPage";
import { MaintenanceServiceTasksListPage } from "../pages/lists/maintenance/MaintenanceServiceTasksListPage";
import { MaintenanceShopLocationsListPage } from "../pages/lists/maintenance/MaintenanceShopLocationsListPage";
import { MaintenanceVendorsListPage } from "../pages/lists/maintenance/MaintenanceVendorsListPage";
import { WorkOrderStatusesListPage } from "../pages/lists/maintenance/WorkOrderStatusesListPage";
import { CivilFineTypesListPage } from "../pages/lists/safety/CivilFineTypesListPage";
import { CompanyViolationTypesListPage } from "../pages/lists/safety/CompanyViolationTypesListPage";
import { ComplaintTypesListPage } from "../pages/lists/safety/ComplaintTypesListPage";
import { DotViolationTypesListPage } from "../pages/lists/safety/DotViolationTypesListPage";
import { CargoClaimReasonsListPage } from "../pages/lists/safety/CargoClaimReasonsListPage";
import { InternalFineReasonsListPage } from "../pages/lists/safety/InternalFineReasonsListPage";
import { LegalTemplateDetailPage } from "../pages/legal/templates/LegalTemplateDetailPage";
import { LegalTemplatesListPage } from "../pages/legal/templates/LegalTemplatesListPage";
import { LegalSignPage } from "../pages/legal/sign/LegalSignPage";
import { LegalAttorneyReviewPortalPage } from "../pages/legal/attorney-review/LegalAttorneyReviewPortalPage";
import { LegalLandingPage } from "../pages/legal/LegalLandingPage";
import { LegalContractInstancesPage } from "../pages/legal/contracts/LegalContractInstancesPage";
import { LegalPoliciesPage } from "../pages/legal/LegalPoliciesPage";
import { PrivacyPolicyPage } from "../pages/legal/PrivacyPolicyPage";
import { TermsOfServicePage } from "../pages/legal/TermsOfServicePage";
import { LegalAttorneyReviewPage } from "../pages/legal/LegalAttorneyReviewPage";
import { LegalMattersListPage } from "../pages/legal/matters/LegalMattersListPage";
import { LegalMatterNewPage } from "../pages/legal/matters/LegalMatterNewPage";
import { LegalMatterDetailPage } from "../pages/legal/matters/LegalMatterDetailPage";
import { LegalReportsLandingPage } from "../pages/legal/reports/LegalReportsLandingPage";
import { DriverSchedulerGridPage } from "../pages/safety/driver-scheduler/DriverSchedulerGridPage";
import { DriverSchedulerRequestInboxPage } from "../pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage";
import { DriverSchedulerRequestDetailPage } from "../pages/safety/driver-scheduler/DriverSchedulerRequestDetailPage";
import { DriverLeaveBalancesPage } from "../pages/safety/driver-scheduler/DriverLeaveBalancesPage";
import Audit425cPage from "../pages/safety/audit-425c/Audit425cPage";
import HosExceptionsPage from "../pages/safety/hos/HosExceptionsPage";
import TrainingProgramsTab from "../pages/safety/tabs/TrainingProgramsTab";
import { TrainingRecordsTab } from "../pages/safety/tabs/TrainingRecordsTab";
import SafetyReportsPage from "../pages/safety/reports/SafetyReportsPage";
import DriverSafetyProfilePage from "../pages/safety/driver-safety/DriverSafetyProfilePage";
import { IntegrityAlertsPage } from "../pages/safety/IntegrityAlertsPage";
import { DailyTasksPage } from "../pages/daily-tasks/DailyTasksPage";
import { VendorMappingResolutionPage } from "../pages/samsara-vendor-mapping/VendorMappingResolutionPage";

// Tasks module (SIDEBAR-V2-REORG-25)
import { TaskBoardPage } from "../pages/tasks/TaskBoardPage";
import { TasksCalendarPage } from "../pages/tasks/TasksCalendarPage";
import { TasksMinePage } from "../pages/tasks/TasksMinePage";
import { TasksChatPage } from "../pages/tasks/TasksChatPage";
import { TasksReportPage } from "../pages/tasks/TasksReportPage";

// Finance module (SIDEBAR-V2-REORG-25)
import { FinanceOverviewPage } from "../pages/finance/FinanceOverviewPage";
import { FinanceProjectionsPage } from "../pages/finance/FinanceProjectionsPage";
import { LoanWizardPage } from "../pages/finance/LoanWizardPage";
import { CalculatorPage } from "../pages/finance/CalculatorPage";
import { AmortizationPage } from "../pages/finance/AmortizationPage";
import { FinanceScenariosPage } from "../pages/finance/FinanceScenariosPage";

// Inventory module (SIDEBAR-V2-REORG-25)
import { InventoryPartsStockPage } from "../pages/inventory/InventoryPartsStockPage";
import { InventoryAssignmentsPage } from "../pages/inventory/InventoryAssignmentsPage";
import { InventoryPurchasesPage } from "../pages/inventory/InventoryPurchasesPage";

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
  if (auth.user.role === "Owner") return <OwnerHome auth={auth.user} />;
  return <HomePage auth={auth.user} />;
}

function QboHomepageRoute() {
  const auth = useAuth();
  if (!auth.user) return null;
  return <QboStyleHomePage auth={auth.user} />;
}

function MaintenanceTabRoute({ tabId }: { tabId: MaintenanceTabId }) {
  return <MaintenanceHomePage initialTab={tabId} />;
}

function DriversSubtabRoute({ subnav }: { subnav: DriversSubnavId | "disputes" }) {
  return <DriversPage initialSubnav={subnav} />;
}

type FactoringTabId =
  | "recourse_pipeline"
  | "chargebacks_fees"
  | "statements_settings"
  | "faro_imports"
  | "equipment_loans"
  | "vendor_merges"
  | "reserve_tracker";

function FactoringTabRoute({ tabId }: { tabId: FactoringTabId }) {
  return <FactoringHomePage initialTab={tabId} />;
}

function FuelTabRoute({ tabId }: { tabId: FuelTabId }) {
  return <FuelPlannerHomePage initialTab={tabId} />;
}

function DispatchLoadsRoute() {
  return <DispatchPage loadsDeepLink />;
}

type DispatchSecondarySubTabId = "load_board" | "book_load" | "assignments" | "settlements" | "pre_settlements";

function DispatchSecondaryTabRoute({ subTab }: { subTab: DispatchSecondarySubTabId }) {
  return <DispatchPage initialSubTab={subTab} />;
}

function FactoringBatchDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();

  if (!id || !selectedCompanyId) {
    return <div className="text-sm text-gray-500">Batch detail unavailable.</div>;
  }

  return <BatchDetail batchId={id} companyId={selectedCompanyId} />;
}

// Locked UI-surface sentinel paths verified by architecture guard.
function IntegrityAlertsTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <IntegrityAlertsPage operatingCompanyId={selectedCompanyId ?? ""} />;
}

function DriverSafetyProfileTab() {
  const { driverId } = useParams();
  return <DriverSafetyProfilePage key={driverId} />;
}

function DispatchLoadDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/dispatch?view=loads" replace />;
  return <Navigate to={`/dispatch?load_id=${encodeURIComponent(id)}`} replace />;
}

/** Legacy bookmarked underscore paths → hyphen canonical routes (Block A10). */
const UNDERSCORE_LEGACY_REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  ["/lists/driver/pay_rate_templates", "/lists/driver/pay-rate-templates"],
  ["/lists/dispatch/load_types", "/lists/dispatch/load-types"],
  ["/lists/dispatch/detention_reasons", "/lists/dispatch/detention-reasons"],
  ["/lists/dispatch/pickup_time_types", "/lists/dispatch/pickup-time-types"],
  ["/lists/dispatch/additional_charges", "/lists/dispatch/additional-charges"],
  ["/lists/dispatch/load_cancellation_reasons", "/lists/dispatch/load-cancellation-reasons"],
];

function UnderscoreLegacyRedirect({ from, to }: { from: string; to: string }) {
  void from;
  return <Navigate to={to} replace />;
}

function ListsDomainRoute() {
  const { domain } = useParams();
  const location = useLocation();
  if (domain) {
    const redirectPath = resolveUnderscoreRedirectPath(`/lists/${domain}`);
    if (redirectPath) {
      return <Navigate to={`${redirectPath}${location.search}${location.hash}`} replace />;
    }
  }
  return <ComingSoonPage />;
}

function ListsCatalogKeyRoute() {
  const { domain, catalogKey } = useParams();
  const location = useLocation();
  if (domain && catalogKey) {
    const redirectPath = resolveUnderscoreRedirectPath(`/lists/${domain}/${catalogKey}`);
    if (redirectPath) {
      return <Navigate to={`${redirectPath}${location.search}${location.hash}`} replace />;
    }
  }
  return <ComingSoonPage />;
}

const LOCKED_SAFETY_TAB_PATHS = ["/safety/driver-files"];
void LOCKED_SAFETY_TAB_PATHS;


export const ROUTES = React.Children.toArray(
  <>
<Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/reset" element={<LoginResetRequestPage />} />
        <Route path="/login/reset/confirm" element={<LoginResetConfirmPage />} />
        <Route path="/legal/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/legal/terms" element={<TermsOfServicePage />} />
        <Route path="/sign/:token" element={<LegalSignPage />} />
        <Route path="/attorney-review/:token" element={<LegalAttorneyReviewPortalPage />} />
        <Route path="/owner-approval/:token" element={<OwnerApprovalPortalPage />} />
        <Route path="/apply/:token" element={<ApplicationPage />} />
        <Route path="/portal/login" element={<PortalLoginPage />} />
        <Route
          path="/portal"
          element={
            <PortalRouteGuard>
              <PortalLayout />
            </PortalRouteGuard>
          }
        >
          <Route index element={<Navigate to="/portal/dashboard" replace />} />
          <Route path="dashboard" element={<PortalDashboardPage />} />
          <Route path="loads/:id" element={<PortalLoadDetailPage />} />
          <Route path="profile" element={<PortalProfilePage />} />
        </Route>
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomeRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/homepage"
          element={
            <ProtectedRoute>
              <QboHomepageRoute />
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
          path="/drivers/profiles"
          element={
            <ProtectedRoute>
              <DriversSubtabRoute subnav="profiles" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/settlements"
          element={
            <ProtectedRoute>
              <DriversSubtabRoute subnav="settlements" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/pre-settlements"
          element={
            <ProtectedRoute>
              <DriversSubtabRoute subnav="pre_settlements" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/cash-advances"
          element={
            <ProtectedRoute>
              <DriversSubtabRoute subnav="cash_advances" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/permits"
          element={
            <ProtectedRoute>
              <DriversSubtabRoute subnav="permits" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/pay-rate-templates"
          element={
            <ProtectedRoute>
              <DriversSubtabRoute subnav="pay_rate_templates" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/deductions"
          element={
            <ProtectedRoute>
              <DriversSubtabRoute subnav="deductions" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/disputes"
          element={
            <ProtectedRoute>
              <DriversSubtabRoute subnav="disputes" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/leave"
          element={
            <ProtectedRoute>
              <DriversSubtabRoute subnav="leave" />
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
          path="/docs"
          element={
            <OwnerAdminRoute>
              <DocsHomePage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/eld"
          element={
            <OwnerOnlyRoute>
              <EldPage />
            </OwnerOnlyRoute>
          }
        />
        <Route
          path="/cash-flow"
          element={
            <ProtectedRoute>
              <CashFlowPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver-hub"
          element={
            <ProtectedRoute>
              <DriverHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver-hub/reporting"
          element={
            <ProtectedRoute>
              <DriverHubReportingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/at-risk"
          element={
            <ProtectedRoute>
              <AtRiskQueuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/factoring-queue"
          element={
            <ProtectedRoute>
              <FactoringQueuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/in-transit-issues"
          element={
            <ProtectedRoute>
              <InTransitIssuesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/assignment-history"
          element={
            <ProtectedRoute>
              <AssignmentHistoryPage />
            </ProtectedRoute>
          }
        />
        {/* Unified Timeline is the default planner view (Phase 1). The 3 legacy tabs stay reachable (archive-not-delete). */}
        <Route path="/dispatch/planners" element={<Navigate replace to="/dispatch/planners/timeline" />} />
        <Route
          path="/dispatch/planners/timeline"
          element={
            <ProtectedRoute>
              <DispatchPlannersLayout><UnifiedTimelinePlanner /></DispatchPlannersLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/planner"
          element={
            <ProtectedRoute>
              <PlannerCalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/planners/driver"
          element={
            <ProtectedRoute>
              <DispatchPlannersLayout><DriverPlanner /></DispatchPlannersLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/planners/truck"
          element={
            <ProtectedRoute>
              <DispatchPlannersLayout><TruckPlanner /></DispatchPlannersLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/planners/loads"
          element={
            <ProtectedRoute>
              <DispatchPlannersLayout><LoadsPlanner /></DispatchPlannersLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/detention"
          element={
            <ProtectedRoute>
              <DetentionBoardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/equipment-transfers"
          element={
            <ProtectedRoute>
              <EquipmentTransferRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/ocr-queue"
          element={
            <ProtectedRoute>
              <OcrQueuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/notify-preferences"
          element={
            <ProtectedRoute>
              <NotifyPreferencesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/pod-review"
          element={
            <ProtectedRoute>
              <PodReviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/settings"
          element={
            <ProtectedRoute>
              <DispatchSettingsPage />
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
          path="/dispatch/alerts/late-arrivals"
          element={
            <ProtectedRoute>
              <LateArrivalsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/border-crossing/history"
          element={
            <ProtectedRoute>
              <BorderCrossingHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/border-crossing"
          element={
            <ProtectedRoute>
              <BorderCrossingWizardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/borders/geofence-history"
          element={
            <ProtectedRoute>
              <GpsBorderCrossingHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/map"
          element={
            <ProtectedRoute>
              <MapView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/book-load"
          element={
            <ProtectedRoute>
              <DispatchSecondaryTabRoute subTab="book_load" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/assignments"
          element={
            <ProtectedRoute>
              <DispatchSecondaryTabRoute subTab="assignments" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/settlements"
          element={
            <ProtectedRoute>
              <DispatchSecondaryTabRoute subTab="settlements" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/pre-settlements"
          element={
            <ProtectedRoute>
              <DispatchSecondaryTabRoute subTab="pre_settlements" />
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
          path="/dispatch/geofencing"
          element={
            <ProtectedRoute>
              <GeofencesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/loads/:id"
          element={
            <ProtectedRoute>
              <DispatchLoadDetailRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/loads"
          element={
            <ProtectedRoute>
              <DispatchLoadsRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/incidents"
          element={
            <ProtectedRoute>
              <Navigate to="/dispatch/alerts" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/factoring-packets"
          element={
            <ProtectedRoute>
              <Navigate to="/accounting/factoring" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/daily-tasks"
          element={
            <ProtectedRoute>
              <DailyTasksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fuel"
          element={
            <ProtectedRoute>
              <FuelTabRoute tabId="home" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fuel/planner"
          element={
            <ProtectedRoute>
              <FuelTabRoute tabId="planner" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fuel/inbox"
          element={
            <ProtectedRoute>
              <FuelTabRoute tabId="relay_inbox" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fuel/settings"
          element={
            <ProtectedRoute>
              <FuelTabRoute tabId="settings" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fuel/expense-mapping"
          element={
            <ProtectedRoute>
              <FuelTabRoute tabId="expense_mapping" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fuel/history"
          element={
            <ProtectedRoute>
              <FuelTabRoute tabId="history" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fuel/loves-prices"
          element={
            <ProtectedRoute>
              <FuelTabRoute tabId="loves_prices" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fuel/compliance"
          element={
            <ProtectedRoute>
              <FuelTabRoute tabId="compliance" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/transactions"
          element={
            <ProtectedRoute>
              <BankingHomePage initialTab="transactions" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/driver-escrow"
          element={
            <ProtectedRoute>
              <BankingHomePage initialTab="driver_escrow" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/reports"
          element={
            <ProtectedRoute>
              <BankingHomePage initialTab="reports" />
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
              <BankReconciliationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banking/reconciliation-workspace"
          element={
            <ProtectedRoute>
              <ReconciliationWorkspacePage />
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
          path="/compliance"
          element={
            <ProtectedRoute>
              <ComplianceDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationCenterPage />
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
          <Route index element={<Navigate to="/safety/safety-events" replace />} />
          <Route path="driver-files" element={<DriverFilesTab />} />
          <Route path="/safety/driver-files" element={<DriverFilesTab />} />
          <Route path="drug-alcohol" element={<DrugAlcoholTab />} />
          <Route path="safety-meetings" element={<SafetyMeetingsTab />} />
          <Route path="/safety/training/programs" element={<TrainingProgramsTab />} />
          <Route path="/safety/training/records" element={<TrainingRecordsTab />} />
          <Route path="hos" element={<HoursOfServiceTab />} />
          <Route path="/safety/eld/audit-trail" element={<EldAuditTrailViewer />} />
          <Route path="/safety/hos/exceptions" element={<HosExceptionsPage />} />
          <Route path="hos-violations" element={<HOSViolationsTab />} />
          <Route path="idvr" element={<IDVRTab />} />
          <Route path="/safety/idvr" element={<IDVRTab />} />
          <Route path="dot-inspections" element={<DOTInspectionsTab />} />
          <Route path="driver-scoring" element={<DriverScoringTab />} />
          <Route path="csa-score" element={<CSAScoreTab />} />
          <Route path="dot-compliance" element={<DOTComplianceTab />} />
          <Route path="safety-events" element={<SafetyEventsTab />} />
          <Route path="/safety/safety-events" element={<SafetyEventsTab />} />
          <Route path="accidents" element={<AccidentsIncidentsTab />} />
          <Route path="damage-reports" element={<DamageReportsTab />} />
          <Route path="trailer-interchanges" element={<TrailerInterchangesTab />} />
          <Route path="/safety/trailer-interchanges" element={<TrailerInterchangesTab />} />
          <Route path="cargo-claims" element={<CargoClaimsTab />} />
          <Route path="internal-fines" element={<InternalFinesTab />} />
          <Route path="external-fines" element={<ExternalFinesTab />} />
          <Route path="complaints" element={<ComplaintsTab />} />
          <Route path="escrow-record" element={<EscrowRecordTab />} />
          <Route path="geofence-alerts" element={<GeofenceBreachesTab />} />
          <Route path="insurance" element={<InsuranceTab />} />
          <Route path="insurance/*" element={<InsuranceTab />} />
          <Route path="permits" element={<PermitsTab />} />
          <Route path="/safety/permits" element={<PermitsTab />} />
          <Route path="integrity-reports" element={<IntegrityReportsTab />} />
          <Route path="/safety/integrity-reports" element={<IntegrityReportsTab />} />
          <Route path="/safety/position-history" element={<PositionHistoryPage />} />
          <Route path="/safety/integrity-alerts" element={<IntegrityAlertsTab />} />
          <Route path="/safety/audit-425c" element={<Audit425cPage />} />
          <Route path="/safety/reports" element={<SafetyReportsPage />} />
          <Route path="/safety/driver-profiles/:driverId" element={<DriverSafetyProfileTab />} />
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
          path="/maintenance/work-orders/new"
          element={
            <ProtectedRoute>
              <WorkOrderNewPage />
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
          path="/maintenance/defects/:defectId"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <DefectDetailPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/defects"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <DefectsInboxPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/work-orders"
          element={
            <ProtectedRoute>
              <WorkOrdersConsoleListPage />
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
          path="/maintenance/active-wos"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="active_wos" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/fleet-table"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="fleet_table" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/rm-status-board"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="rm_status_board" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/service-location"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="service_location" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/in-transit-issues"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="in_transit_issues" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/in-transit"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="in_transit_issues" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/triage"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="in_transit_issues" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/damage-reports"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="damage_reports" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/driver-reports"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="driver_reports" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/severe-repairs"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="severe_repairs" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/road-service"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="road_service" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/parts-inventory"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="parts_inventory" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/settings"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="settings" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/vehicles"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <VehiclesMasterDataPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/drivers"
          element={
            <ProtectedRoute>
              <DriversMasterDataPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/parts"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <PartsMasterDataPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/arriving-soon"
          element={
            <ProtectedRoute>
              <MaintenanceTabRoute tabId="arriving_soon" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/pm-schedule"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <PmSchedulePage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/pm-auto-engine"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <PmAutoEnginePage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/kpi-dashboard"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <MaintKpiDashboardPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/inspections"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <InspectionsPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/tires"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <TireProgramPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/warranty-claims"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <WarrantyClaimsPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/vendors"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <MaintenanceVendorsPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/vendors/:vendorId"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <MaintenanceVendorDetailPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/reports"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <MaintenanceReportsPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/compliance"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <Compliance425CPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/position-history"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <PositionHistoryPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/fault-drafts"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <FaultDraftsPage />
              </MaintenanceShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance/fault-rules"
          element={
            <ProtectedRoute>
              <MaintenanceShell>
                <FaultRulesPage />
              </MaintenanceShell>
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
          path="/factoring/recourse-pipeline"
          element={
            <ProtectedRoute>
              <FactoringTabRoute tabId="recourse_pipeline" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring/chargebacks-fees"
          element={
            <ProtectedRoute>
              <FactoringTabRoute tabId="chargebacks_fees" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring/statements-settings"
          element={
            <ProtectedRoute>
              <FactoringTabRoute tabId="statements_settings" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring/faro-imports"
          element={
            <ProtectedRoute>
              <FactoringTabRoute tabId="faro_imports" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring/equipment-loans"
          element={
            <ProtectedRoute>
              <FactoringTabRoute tabId="equipment_loans" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring/vendor-merges"
          element={
            <ProtectedRoute>
              <FactoringTabRoute tabId="vendor_merges" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring/reserve-tracker"
          element={
            <ProtectedRoute>
              <FactoringTabRoute tabId="reserve_tracker" />
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
          path="/factoring/batches/new"
          element={
            <ProtectedRoute>
              <BatchWizard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring/batches/:id"
          element={
            <ProtectedRoute>
              <FactoringBatchDetailRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring/factors"
          element={
            <ProtectedRoute>
              <FactorAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring/reserves"
          element={
            <ProtectedRoute>
              <ReserveDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/factoring/faro-import"
          element={
            <ProtectedRoute>
              <FaroImportPage />
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
          path="/lists/names"
          element={
            <ProtectedRoute>
              <NamesMasterHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/names/brokers"
          element={
            <ProtectedRoute>
              <BrokersListPage />
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
          path="/lists/dispatch/load-cancellation-reasons"
          element={
            <ProtectedRoute>
              <LoadCancellationReasonsListPage />
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
          path="/lists/driver/license-classes"
          element={
            <ProtectedRoute>
              <LicenseClassesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/driver/endorsements"
          element={
            <ProtectedRoute>
              <CdlEndorsementsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/driver/restrictions"
          element={
            <ProtectedRoute>
              <CdlRestrictionsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/driver/medical-card-status"
          element={
            <ProtectedRoute>
              <MedicalCardStatusesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/driver/employment-status"
          element={
            <ProtectedRoute>
              <EmploymentStatusesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/drivers/license-classes"
          element={
            <ProtectedRoute>
              <DriversLicenseClassesCatalog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/drivers/endorsements"
          element={
            <ProtectedRoute>
              <DriversEndorsementsCatalog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/drivers/restrictions"
          element={
            <ProtectedRoute>
              <DriversRestrictionsCatalog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/drivers/medical-card-status"
          element={
            <ProtectedRoute>
              <DriversMedicalCardStatusCatalog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/drivers/employment-status"
          element={
            <ProtectedRoute>
              <DriversEmploymentStatusCatalog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/drivers/termination-reasons"
          element={
            <ProtectedRoute>
              <TerminationReasonsListPage />
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
          path="/lists/maintenance/oem-parts-reference"
          element={
            <ProtectedRoute>
              <OemPartsCatalog />
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
          path="/lists/safety/complaint-types"
          element={
            <ProtectedRoute>
              <ComplaintTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/safety/dot-violation-types"
          element={
            <ProtectedRoute>
              <DotViolationTypesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/safety/cargo-claim-reasons"
          element={
            <ProtectedRoute>
              <CargoClaimReasonsListPage />
            </ProtectedRoute>
          }
        />
        {UNDERSCORE_LEGACY_REDIRECTS.map(([from, to]) => (
          <Route
            key={from}
            path={from}
            element={
              <ProtectedRoute>
                <UnderscoreLegacyRedirect from={from} to={to} />
              </ProtectedRoute>
            }
          />
        ))}
        <Route
          path="/lists/:domain"
          element={
            <ProtectedRoute>
              <ListsDomainRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lists/:domain/:catalogKey"
          element={
            <ProtectedRoute>
              <ListsCatalogKeyRoute />
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
          path="/samsara/vendor-mapping-integrity"
          element={
            <ProtectedRoute>
              <VendorMappingResolutionPage />
            </ProtectedRoute>
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
          path="/help/overview"
          element={
            <ProtectedRoute>
              <HelpPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/help/runbooks"
          element={
            <ProtectedRoute>
              <RunbooksIndex />
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
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingWizard />
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
          path="/reports/ifta"
          element={
            <ProtectedRoute>
              <IFTAPreparer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/ifta-preparer"
          element={
            <ProtectedRoute>
              <IftaPreparer />
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
          path="/reports/trial-balance"
          element={
            <ProtectedRoute>
              <TrialBalancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/profit-loss"
          element={
            <ProtectedRoute>
              <ProfitLossPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/balance-sheet"
          element={
            <ProtectedRoute>
              <BalanceSheetPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/cash-flow-statement"
          element={
            <ProtectedRoute>
              <CashFlowStatementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/cash-flow"
          element={
            <ProtectedRoute>
              <CashFlowReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/per-truck-cpm"
          element={
            <ProtectedRoute>
              <PerTruckCpmReport />
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
          path="/reports/lane-profitability"
          element={
            <ProtectedRoute>
              <LaneProfitabilityPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/cancellations"
          element={
            <ProtectedRoute>
              <CancellationsReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/qbo/sync-dashboard"
          element={
            <ProtectedRoute>
              <QboSyncDetailPage />
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
          path="/reports/dispatch-margin"
          element={
            <ProtectedRoute>
              <DispatchMarginPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/geofence-dwell"
          element={
            <ProtectedRoute>
              <GeofenceDwellReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/geofence-reconciliation"
          element={
            <ProtectedRoute>
              <GeofenceReconciliationReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/booking-gap"
          element={
            <ProtectedRoute>
              <BookingGapReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/deadhead"
          element={
            <ProtectedRoute>
              <DeadheadReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/scheduled"
          element={
            <ProtectedRoute>
              <SubscriptionManager />
            </ProtectedRoute>
          }
        />
        <Route path="/reports/audit/activity-by-user" element={<OwnerAdminRoute><AuditActivityByUserPage /></OwnerAdminRoute>} />
        <Route path="/reports/audit/activity-by-module" element={<OwnerAdminRoute><AuditActivityByModulePage /></OwnerAdminRoute>} />
        <Route path="/reports/audit/financial-change-log" element={<OwnerAdminRoute><AuditFinancialChangeLogPage /></OwnerAdminRoute>} />
        <Route path="/reports/audit/maintenance-decision-log" element={<OwnerAdminRoute><AuditMaintenanceDecisionLogPage /></OwnerAdminRoute>} />
        <Route path="/reports/audit/deduction-trail" element={<OwnerAdminRoute><AuditDeductionTrailPage /></OwnerAdminRoute>} />
        <Route path="/reports/audit/void-reversal" element={<OwnerAdminRoute><AuditVoidReversalPage /></OwnerAdminRoute>} />
        <Route path="/reports/audit/period-close-history" element={<OwnerAdminRoute><AuditPeriodCloseHistoryPage /></OwnerAdminRoute>} />
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
          path="/admin/carrier-bootstrap"
          element={
            <OwnerAdminRoute>
              <CarrierBootstrapPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/admin/launch-toggles"
          element={
            <OwnerAdminRoute>
              <LaunchTogglesPage />
            </OwnerAdminRoute>
          }
        />
        <Route
          path="/admin/feature-flags"
          element={
            <OwnerAdminRoute>
              <FeatureFlagsManager />
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
          path="/admin/audit-events"
          element={
            <OwnerSuperAdminRoute>
              <AuditEventsList />
            </OwnerSuperAdminRoute>
          }
        />
        <Route
          path="/admin/audit-log"
          element={
            <OwnerSuperAdminRoute>
              <AuditLogViewer />
            </OwnerSuperAdminRoute>
          }
        />
        <Route
          path="/audit/trail"
          element={
            <OwnerSuperAdminRoute>
              <AuditTrailPage />
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
          path="/admin/observability"
          element={
            <OwnerAdminRoute>
              <ObservabilityPage />
            </OwnerAdminRoute>
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
          path="/admin/mobile-audit"
          element={
            <OwnerAdminRoute>
              <MobileAuditReport />
            </OwnerAdminRoute>
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
          path="/accounting/vendors"
          element={
            <ProtectedRoute>
              <Navigate to="/vendors" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/customers"
          element={
            <ProtectedRoute>
              <Navigate to="/customers" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/reports"
          element={
            <ProtectedRoute>
              <Navigate to="/reports" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/maintenance-shop"
          element={
            <ProtectedRoute>
              <Navigate to="/maintenance" replace />
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
          path="/accounting/transactions"
          element={
            <ProtectedRoute>
              <TransactionRegisterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/multi-entity"
          element={
            <ProtectedRoute>
              <MultiEntityAccountingPage />
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
          path="/accounting/factor-reconciliation"
          element={
            <ProtectedRoute>
              <FactorReconciliationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/reconciliation"
          element={
            <ProtectedRoute>
              <AccountingReconciliationWorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/daily-recon"
          element={
            <ProtectedRoute>
              <DailyReconPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/sales-tax"
          element={
            <ProtectedRoute>
              <SalesTaxPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/month-close"
          element={
            <ProtectedRoute>
              <MonthClosePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/audit-trail"
          element={
            <ProtectedRoute>
              <AccountingAuditTrailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/posting-lineage"
          element={
            <ProtectedRoute>
              <PostingLineagePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/escrow"
          element={
            <ProtectedRoute>
              <EscrowPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/cash-forecast"
          element={
            <ProtectedRoute>
              <CashForecastPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={COLLECTIONS_ROUTE.path}
          element={
            <ProtectedRoute>
              {COLLECTIONS_ROUTE.component}
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/accounts-payable"
          element={
            <ProtectedRoute>
              {AP_AGING_ROUTE.component}
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/trip-pairing"
          element={
            <ProtectedRoute>
              {TRIP_PAIRING_BOARD_ROUTE.component}
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/period-comparison"
          element={
            <ProtectedRoute>
              <PeriodComparisonPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/pre-settlements"
          element={
            <ProtectedRoute>
              <AccountingPreSettlementsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/payroll"
          element={
            <ProtectedRoute>
              <PayrollAggregatedPage />
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
          path="/accounting/bills/maintenance"
          element={
            <ProtectedRoute>
              <Navigate to="/accounting/bills?category=maintenance" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/bills/repair"
          element={
            <ProtectedRoute>
              <Navigate to="/accounting/bills?category=repair" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/bills/fuel"
          element={
            <ProtectedRoute>
              <Navigate to="/accounting/bills?category=fuel" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/bills/driver"
          element={
            <ProtectedRoute>
              <Navigate to="/accounting/bills?category=driver" replace />
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
          path="/accounting/bills/multiple"
          element={
            <ProtectedRoute>
              <CreateMultipleBillsPage />
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
          path="/accounting/vendor-balances"
          element={
            <ProtectedRoute>
              <VendorBalancesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/journal-entries"
          element={
            <ProtectedRoute>
              <ManualJEListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/account-register"
          element={
            <ProtectedRoute>
              <AccountRegisterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/journal-entries/:id"
          element={
            <ProtectedRoute>
              <JournalEntryDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/settings/expense-category-map"
          element={
            <ProtectedRoute>
              <ExpenseCategoryMapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/settings/coa-roles"
          element={
            <ProtectedRoute>
              <CoaRolesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/bill-payments"
          element={
            <ProtectedRoute>
              <BillPaymentsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/qbo-sync"
          element={
            <ProtectedRoute>
              <QBOSyncDriftDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/safety/accidents-incidents" element={<Navigate replace to="/safety/accidents" />} />
        <Route
          path="/accounting/recurring-transactions"
          element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>}
        />
        {/* UI-1 stubs: routes exist but pages are not yet built — ComingSoonPage inline.
            COMPLETE-BUILD rule: build fully or remove the route. Do NOT add a real page
            component here until the page is 100% wired end-to-end. */}
        <Route path="/accounting/integration-transactions" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />
        <Route path="/accounting/receipts" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />
        <Route path="/accounting/revenue-recognition" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />
        <Route path="/accounting/fixed-assets" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />
        <Route path="/accounting/prepaid-expenses" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />
        <Route path="/accounting/my-accountant" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />
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
              <Navigate to="/lists/accounting/classes" replace />
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
              <Navigate to="/lists/accounting/payment-terms" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/posting-templates"
          element={
            <ProtectedRoute>
              <Navigate to="/lists/accounting/posting-templates" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs/account-role-bindings"
          element={
            <ProtectedRoute>
              <Navigate to="/lists/accounting/account-role-bindings" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/onboarding/:session_id"
          element={
            <ProtectedRoute>
              <OnboardingWizardPage />
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
          path="/drivers/applicants"
          element={
            <ProtectedRoute>
              <ApplicantsPipelinePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/messages"
          element={
            <ProtectedRoute>
              <MessagesInboxPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/retention"
          element={
            <ProtectedRoute>
              <RetentionDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/alerts"
          element={
            <ProtectedRoute>
              <DocumentAlertsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/:id/profile"
          element={
            <ProtectedRoute>
              <DriverProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drivers/:id/hos"
          element={
            <ProtectedRoute>
              <DriverHosDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fleet/transfers-in-progress"
          element={
            <ProtectedRoute>
              <TransfersInProgressPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fleet"
          element={
            <ProtectedRoute>
              <FleetHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fleet/units/:id"
          element={
            <ProtectedRoute>
              <VehicleProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fleet/trailers/:id"
          element={
            <ProtectedRoute>
              <TrailerProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compliance"
          element={
            <ProtectedRoute>
              <ComplianceDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationCenterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dev/bulk-demo"
          element={
            <ProtectedRoute>
              <BulkDemoPage />
            </ProtectedRoute>
          }
        />
        {/* Tasks module (SIDEBAR-V2-REORG-25) */}
        <Route path="/tasks" element={<ProtectedRoute><TaskBoardPage /></ProtectedRoute>} />
        <Route path="/tasks/calendar" element={<ProtectedRoute><TasksCalendarPage /></ProtectedRoute>} />
        <Route path="/tasks/mine" element={<ProtectedRoute><TasksMinePage /></ProtectedRoute>} />
        <Route path="/tasks/chat" element={<ProtectedRoute><TasksChatPage /></ProtectedRoute>} />
        <Route path="/tasks/report" element={<ProtectedRoute><TasksReportPage /></ProtectedRoute>} />
        {/* Finance module (SIDEBAR-V2-REORG-25) */}
        <Route path="/finance" element={<ProtectedRoute><FinanceOverviewPage /></ProtectedRoute>} />
        <Route path="/finance/projections" element={<ProtectedRoute><FinanceProjectionsPage /></ProtectedRoute>} />
        <Route path="/finance/scenarios" element={<ProtectedRoute><FinanceScenariosPage /></ProtectedRoute>} />
        <Route path="/finance/loan-wizard" element={<ProtectedRoute><LoanWizardPage /></ProtectedRoute>} />
        <Route path="/finance/calculator" element={<ProtectedRoute><CalculatorPage /></ProtectedRoute>} />
        <Route path="/finance/amortization" element={<ProtectedRoute><AmortizationPage /></ProtectedRoute>} />
        {/* Inventory module (SIDEBAR-V2-REORG-25) */}
        <Route path="/inventory" element={<ProtectedRoute><InventoryPartsStockPage /></ProtectedRoute>} />
        <Route path="/inventory/assignments" element={<ProtectedRoute><InventoryAssignmentsPage /></ProtectedRoute>} />
        <Route path="/inventory/purchases" element={<ProtectedRoute><InventoryPurchasesPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="/insurance" element={<Navigate to="/safety/insurance" replace />} />
  </>
) as React.ReactElement[];
