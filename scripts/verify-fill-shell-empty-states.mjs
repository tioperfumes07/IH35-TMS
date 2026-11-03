#!/usr/bin/env node
/** Fill-not-shell — FactoringHome empty/loading, BatchWizard, Fuel planner settings states use BoardSection/FuelBoardSection. */
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", "BoardSection", "factoring-home-loading", "FactoringHome loading"],
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", "BoardSection", "factoring-home-need-company", "FactoringHome need-company"],
  ["apps/frontend/src/pages/factoring/BatchWizard.tsx", "BoardSection", "factoring-batch-wizard-board", "BatchWizard body"],
  ["apps/frontend/src/pages/factoring/BatchWizard.tsx", "BoardSection", "factoring-batches-need-company", "BatchWizard need-company"],
  ["apps/frontend/src/pages/factoring/Faro1090WireProposalsPage.tsx", "BoardSection", "faro-1090-need-company", "Faro1090 need-company"],
  ["apps/frontend/src/pages/factoring/FactorAdmin.tsx", "BoardSection", "factor-admin-need-company", "FactorAdmin need-company"],
  ["apps/frontend/src/pages/factoring/FaroDebtorRecordPage.tsx", "BoardSection", "faro-debtor-need-company", "FaroDebtor need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementsPage.tsx", "BoardSection", "settlements-need-company", "Settlements need-company"],
  ["apps/frontend/src/pages/driver-finance/BatchSettlementsPage.tsx", "BoardSection", "batch-settlements-need-company", "BatchSettlements need-company"],
  ["apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx", "BoardSection", "company-settlements-need-company", "CompanySettlements need-company"],
  ["apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx", "BoardSection", "escrow-register-need-company", "EscrowRegister need-company"],
  ["apps/frontend/src/pages/driver-finance/DriverBillDetailPage.tsx", "BoardSection", "driver-bill-detail-need-company", "DriverBillDetail need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementsPreSettlementsBoard.tsx", "BoardSection", "settlements-presettle-need-company", "PreSettlements need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementsCashAdvancesBoard.tsx", "BoardSection", "settlements-cash-advances-need-company", "CashAdvances need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementsDeductionsBoard.tsx", "BoardSection", "settlements-deductions-need-company", "Deductions need-company"],
  ["apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx", "BoardSection", "escrow-deductions-pending-need-company", "EscrowDeductionsPending need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx", "BoardSection", "settlement-detail-need-company", "SettlementDetail need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx", "BoardSection", "settlement-workflow-need-company", "SettlementWorkflow need-company"],
  ["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", "FuelBoardSection", "fuel-planner-settings-loading", "Planner settings loading"],
  ["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", "FuelBoardSection", "fuel-planner-settings-unavailable", "Planner settings unavailable"],
  ["apps/frontend/src/pages/finance/BreakEvenPage.tsx", "BoardSection", "break-even-need-company", "BreakEven need-company"],
  ["apps/frontend/src/pages/finance/FinanceHubPage.tsx", "BoardSection", "finance-hub-need-company", "FinanceHub need-company"],
  ["apps/frontend/src/pages/finance/AmortizationPage.tsx", "BoardSection", "amortization-need-company", "Amortization need-company"],
  ["apps/frontend/src/pages/finance/FinancialStatementsPage.tsx", "BoardSection", "financial-statements-need-company", "FinancialStatements need-company"],
  ["apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx", "BoardSection", "compliance-dashboard-need-company", "ComplianceDashboard need-company"],
  ["apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx", "BoardSection", "property-tax-need-company", "PropertyTax need-company"],
  ["apps/frontend/src/pages/finance/LoanWizardPage.tsx", "BoardSection", "loan-wizard-need-company", "LoanWizard need-company"],
  ["apps/frontend/src/pages/finance/CalculatorPage.tsx", "BoardSection", "finance-calculator-need-company", "Calculator need-company"],
  ["apps/frontend/src/pages/finance/FinanceScenariosPage.tsx", "BoardSection", "finance-scenarios-need-company", "Scenarios need-company"],
  ["apps/frontend/src/pages/finance/ArApAgingPage.tsx", "BoardSection", "ar-ap-aging-need-company", "ArApAging need-company"],
  ["apps/frontend/src/pages/compliance/Form2290Filings.tsx", "BoardSection", "form-2290-need-company", "Form2290 need-company"],
  ["apps/frontend/src/pages/compliance/FilingsComplianceDueSection.tsx", "BoardSection", "filings-compliance-due-need-company", "FilingsDue need-company"],
  ["apps/frontend/src/pages/form425c/Form425CHome.tsx", "BoardSection", "form-425c-need-company", "Form425C need-company"],
  ["apps/frontend/src/pages/customers/CoiTab.tsx", "BoardSection", "customer-coi-need-company", "CoiTab need-company"],
  ["apps/frontend/src/pages/customers/components/PortalUsersTab.tsx", "BoardSection", "portal-users-need-company", "PortalUsers need-company"],
  ["apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx", "BoardSection", "document-alerts-need-company", "DocumentAlerts need-company"],
  ["apps/frontend/src/pages/integrations/SamsaraIntegrationPage.tsx", "BoardSection", "samsara-integration-need-company", "SamsaraIntegration need-company"],
  ["apps/frontend/src/pages/qbo-sync-detail/QboSyncDetailPage.tsx", "BoardSection", "qbo-sync-detail-need-company", "QboSyncDetail need-company"],
  ["apps/frontend/src/pages/samsara-vendor-mapping/VendorMappingResolutionPage.tsx", "BoardSection", "vendor-mapping-resolution-need-company", "VendorMapping need-company"],
  ["apps/frontend/src/pages/profitability/ByCustomerView.tsx", "BoardSection", "profitability-by-customer-need-company", "ByCustomer need-company"],
  ["apps/frontend/src/pages/profitability/ByLoadView.tsx", "BoardSection", "profitability-by-load-need-company", "ByLoad need-company"],
  ["apps/frontend/src/pages/chat/DispatchChatPage.tsx", "BoardSection", "dispatch-chat-need-company", "DispatchChat need-company"],
  ["apps/frontend/src/pages/docs/DocsHomePage.tsx", "BoardSection", "docs-home-need-company", "DocsHome need-company"],
  ["apps/frontend/src/pages/fuel/relay-unmatched/RelayUnmatchedPage.tsx", "FuelBoardSection", "relay-unmatched-need-company", "RelayUnmatched need-company"],
  ["apps/frontend/src/pages/drivers/RetentionDashboard.tsx", "BoardSection", "driver-retention-need-company", "RetentionDashboard need-company"],
  ["apps/frontend/src/pages/eld/tabs/UnidentifiedTab.tsx", "BoardSection", "eld-unidentified-need-company", "ELD Unidentified need-company"],
  ["apps/frontend/src/pages/eld/tabs/ViolationsTab.tsx", "BoardSection", "eld-violations-need-company", "ELD Violations need-company"],
  ["apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx", "BoardSection", "eld-live-duty-need-company", "ELD LiveDuty need-company"],
  ["apps/frontend/src/pages/home/DriverHubReportingPage.tsx", "BoardSection", "driver-hub-reporting-need-company", "DriverHubReporting need-company"],
  ["apps/frontend/src/pages/home/DriverHubOverview.tsx", "BoardSection", "driver-hub-overview-need-company", "DriverHubOverview need-company"],
  ["apps/frontend/src/pages/home/AttentionList.tsx", "BoardSection", "home-attention-need-company", "AttentionList need-company"],
  ["apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "BoardSection", "driver-profile-need-company", "DriverProfile need-company"],
  ["apps/frontend/src/pages/drivers/DriversListPage.tsx", "BoardSection", "drivers-list-need-company", "DriversList need-company"],
  ["apps/frontend/src/pages/Drivers.tsx", "BoardSection", "drivers-need-company", "Drivers need-company"],
  ["apps/frontend/src/pages/accounting/LeasesPage.tsx", "BoardSection", "leases-need-company", "Leases need-company"],
  ["apps/frontend/src/pages/accounting/DisputesHubPage.tsx", "BoardSection", "disputes-hub-need-company", "DisputesHub need-company"],
  ["apps/frontend/src/pages/accounting/ReceiptsPage.tsx", "BoardSection", "receipts-need-company", "Receipts need-company"],
  ["apps/frontend/src/pages/accounting/FixedAssetsPage.tsx", "BoardSection", "fixed-assets-need-company", "FixedAssets need-company"],
  ["apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx", "BoardSection", "drivers-onboarding-need-company", "Onboarding need-company"],
  ["apps/frontend/src/pages/drivers/DriverLayoverHistoryPage.tsx", "BoardSection", "driver-layover-history-need-company", "LayoverHistory need-company"],
  ["apps/frontend/src/pages/CustomerDetail.tsx", "BoardSection", "customer-detail-need-company", "CustomerDetail need-company"],
  ["apps/frontend/src/pages/insurance/PolicyDetail.tsx", "BoardSection", "policy-detail-need-company", "PolicyDetail need-company"],
  ["apps/frontend/src/pages/insurance/ClaimsTab.tsx", "BoardSection", "insurance-claims-need-company", "ClaimsTab need-company"],
  ["apps/frontend/src/pages/insurance/PoliciesList.tsx", "BoardSection", "insurance-policies-need-company", "PoliciesList need-company"],
  ["apps/frontend/src/pages/insurance/InsuranceLanding.tsx", "BoardSection", "insurance-landing-need-company", "InsuranceLanding need-company"],
  ["apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx", "BoardSection", "coverage-gap-need-company", "CoverageGap need-company"],
  ["apps/frontend/src/pages/insurance/FleetCoveredPage.tsx", "BoardSection", "fleet-covered-need-company", "FleetCovered need-company"],
  ["apps/frontend/src/pages/fleet/FleetHomePage.tsx", "BoardSection", "fleet-need-company", "FleetHome need-company"],
  ["apps/frontend/src/pages/fleet/VehicleProfilePage.tsx", "BoardSection", "vehicle-profile-need-company", "VehicleProfile need-company"],
  ["apps/frontend/src/pages/fleet/TrailerProfilePage.tsx", "BoardSection", "trailer-profile-need-company", "TrailerProfile need-company"],
  ["apps/frontend/src/pages/fleet/TransfersInProgressPage.tsx", "BoardSection", "transfers-need-company", "Transfers need-company"],
  ["apps/frontend/src/pages/fleet/RosterIntegrityPage.tsx", "BoardSection", "roster-integrity-need-company", "RosterIntegrity need-company"],
  ["apps/frontend/src/pages/cash-flow/CashFlowPage.tsx", "BoardSection", "cash-flow-need-company", "CashFlow need-company"],
  ["apps/frontend/src/pages/fuel/FuelHome.tsx", "FuelBoardSection", "fuel-home-need-company", "FuelHome need-company"],
  ["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", "FuelBoardSection", "fuel-planner-need-company", "FuelPlanner need-company"],
  ["apps/frontend/src/pages/factoring/SubmissionQueue.tsx", "BoardSection", "factoring-submit-need-company", "SubmissionQueue need-company"],
  ["apps/frontend/src/pages/factoring/ReserveTracker.tsx", "BoardSection", "factoring-reserves-need-company", "ReserveTracker need-company"],
  ["apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx", "BoardSection", "detention-need-company", "Detention need-company"],
  ["apps/frontend/src/pages/dispatch/TripProfitability.tsx", "BoardSection", "trip-profitability-need-company", "TripProfitability need-company"],
  ["apps/frontend/src/pages/dispatch/MapView.tsx", "BoardSection", "dispatch-map-need-company", "MapView need-company"],
  ["apps/frontend/src/pages/dispatch/DispatchOverview.tsx", "BoardSection", "dispatch-overview-need-company", "DispatchOverview need-company"],
  ["apps/frontend/src/pages/legal/LegalLandingPage.tsx", "BoardSection", "legal-landing-need-company", "LegalLanding need-company"],
  ["apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx", "BoardSection", "legal-matters-need-company", "LegalMatters need-company"],
  ["apps/frontend/src/pages/tasks/TasksMinePage.tsx", "BoardSection", "tasks-mine-need-company", "TasksMine need-company"],
  ["apps/frontend/src/pages/tasks/TaskBoardPage.tsx", "BoardSection", "task-board-need-company", "TaskBoard need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementsEscrowBoard.tsx", "BoardSection", "settlements-escrow-need-company", "SettlementsEscrow need-company"],
  ["apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx", "BoardSection", "cash-advance-requests-need-company", "CashAdvanceRequests need-company"],
  ["apps/frontend/src/pages/VendorDetail.tsx", "BoardSection", "vendor-detail-linked-need-company", "Vendor Detail Linked need-company"],
  ["apps/frontend/src/pages/VendorDetail.tsx", "BoardSection", "vendor-detail-need-company", "Vendor Detail need-company"],
  ["apps/frontend/src/pages/Dispatch.tsx", "BoardSection", "dispatch-pre-settlements-need-company", "Dispatch Pre Settlements need-company"],
  ["apps/frontend/src/pages/Dispatch.tsx", "BoardSection", "dispatch-settlements-need-company", "Dispatch Settlements need-company"],
  ["apps/frontend/src/pages/UserDetail.tsx", "BoardSection", "user-detail-activity-need-company", "User Detail Activity need-company"],
  ["apps/frontend/src/pages/DriverDetail.tsx", "BoardSection", "driver-detail-need-company", "Driver Detail need-company"],
  ["apps/frontend/src/pages/home/roles/AccountingHome.tsx", "BoardSection", "accounting-home-need-company", "Accounting Home need-company"],
  ["apps/frontend/src/pages/fuel/relay-wallet/RelayWalletRollForwardPage.tsx", "FuelBoardSection", "relay-wallet-need-company", "Relay Wallet need-company"],
  ["apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx", "FuelBoardSection", "fuel-fraud-need-company", "Fuel Fraud need-company"],
  ["apps/frontend/src/pages/fuel/cards/FuelCardsPage.tsx", "FuelBoardSection", "fuel-cards-need-company", "Fuel Cards need-company"],
  ["apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx", "FuelBoardSection", "fuel-card-overage-need-company", "Fuel Card Overage need-company"],
  ["apps/frontend/src/pages/fuel/integrity/FuelIntegrityPage.tsx", "FuelBoardSection", "fuel-integrity-need-company", "Fuel Integrity need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx", "BoardSection", "settlement-close-need-company", "Settlement Close need-company"],
  ["apps/frontend/src/pages/tasks/ReconcilerExceptionsPage.tsx", "BoardSection", "reconciler-exceptions-need-company", "Reconciler Exceptions need-company"],
  ["apps/frontend/src/pages/tasks/TasksReportPage.tsx", "BoardSection", "tasks-report-need-company", "Tasks Report need-company"],
  ["apps/frontend/src/pages/tasks/TasksCalendarPage.tsx", "BoardSection", "tasks-calendar-need-company", "Tasks Calendar need-company"],
  ["apps/frontend/src/pages/tasks/TasksChatPage.tsx", "BoardSection", "tasks-chat-need-company", "Tasks Chat need-company"],
  ["apps/frontend/src/pages/drivers/ApplicantsPipelinePage.tsx", "BoardSection", "drivers-applicants-need-company", "Drivers Applicants need-company"],
  ["apps/frontend/src/pages/drivers/PendingSettlementDeductionsPanel.tsx", "BoardSection", "pending-settlement-deductions-need-company", "Pending Settlement Deductions need-company"],
  ["apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx", "BoardSection", "auto-deduction-policies-need-company", "Auto Deduction Policies need-company"],
  ["apps/frontend/src/pages/drivers/MessagesInboxPage.tsx", "BoardSection", "drivers-messages-need-company", "Drivers Messages need-company"],
  ["apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx", "BoardSection", "driver-hos-detail-need-company", "Driver Hos Detail need-company"],
  ["apps/frontend/src/pages/drivers/TeamSplitConfig.tsx", "BoardSection", "team-split-config-need-company", "Team Split Config need-company"],
  ["apps/frontend/src/pages/factoring/FaroImportPage.tsx", "BoardSection", "faro-import-need-company", "Faro Import need-company"],
  ["apps/frontend/src/pages/dispatch/DispatchSettingsPage.tsx", "BoardSection", "dispatch-settings-need-company", "Dispatch Settings need-company"],
  ["apps/frontend/src/pages/dispatch/RoundTrips.tsx", "BoardSection", "round-trips-need-company", "Round Trips need-company"],
  ["apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx", "BoardSection", "late-arrivals-need-company", "Late Arrivals need-company"],
  ["apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", "BoardSection", "dispatch-trip-pairing-need-company", "Dispatch Trip Pairing need-company"],
  ["apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx", "BoardSection", "border-crossing-history-need-company", "Border Crossing History need-company"],
  ["apps/frontend/src/pages/dispatch/AwaitingBolInvoicePage.tsx", "BoardSection", "awaiting-bol-need-company", "Awaiting Bol need-company"],
  ["apps/frontend/src/pages/dispatch/OcrQueuePage.tsx", "BoardSection", "ocr-queue-need-company", "Ocr Queue need-company"],
  ["apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx", "BoardSection", "factoring-queue-need-company", "Factoring Queue need-company"],
  ["apps/frontend/src/pages/dispatch/DispatchAlertsPage.tsx", "BoardSection", "dispatch-alerts-need-company", "Dispatch Alerts need-company"],
  ["apps/frontend/src/pages/dispatch/LoadsWithoutTourPage.tsx", "BoardSection", "loads-without-tour-need-company", "Loads Without Tour need-company"],
  ["apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx", "BoardSection", "notify-preferences-need-company", "Notify Preferences need-company"],
  ["apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx", "BoardSection", "dispatch-planner-need-company", "Dispatch Planner need-company"],
  ["apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx", "BoardSection", "load-banking-linkage-need-company", "Load Banking Linkage need-company"],
  ["apps/frontend/src/pages/dispatch/DriverBillRemintScreen.tsx", "BoardSection", "driver-bill-remint-need-company", "Driver Bill Remint need-company"],
  ["apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx", "BoardSection", "equipment-transfer-need-company", "Equipment Transfer need-company"],
  ["apps/frontend/src/pages/dispatch/OwnerOverrideLogPage.tsx", "BoardSection", "owner-override-log-need-company", "Owner Override Log need-company"],
  ["apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx", "BoardSection", "in-transit-issues-need-company", "In Transit Issues need-company"],
  ["apps/frontend/src/pages/dispatch/NeedsDeliveryAuthorizationPage.tsx", "BoardSection", "needs-delivery-auth-need-company", "Needs Delivery Auth need-company"],
  ["apps/frontend/src/pages/dispatch/PodReviewPage.tsx", "BoardSection", "pod-review-need-company", "Pod Review need-company"],
  ["apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx", "BoardSection", "at-risk-need-company", "At Risk need-company"],
  ["apps/frontend/src/pages/dispatch/LoadsWithoutDriverBillPage.tsx", "BoardSection", "loads-without-driver-bill-need-company", "Loads Without Driver Bill need-company"],
  ["apps/frontend/src/pages/dispatch/LoadHistoryPage.tsx", "BoardSection", "load-history-need-company", "Load History need-company"],
  ["apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx", "BoardSection", "assignment-history-need-company", "Assignment History need-company"],
  ["apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx", "BoardSection", "border-crossing-need-company", "Border Crossing need-company"],
  ["apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx", "BoardSection", "cargo-sensor-timeline-need-company", "Cargo Sensor Timeline need-company"],
  ["apps/frontend/src/pages/dispatch/borders/BorderCrossingHistory.tsx", "BoardSection", "gps-border-crossing-need-company", "Gps Border Crossing need-company"],
  ["apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx", "BoardSection", "dispatch-truck-planner-need-company", "Dispatch Truck Planner need-company"],
  ["apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx", "BoardSection", "dispatch-timeline-need-company", "Dispatch Timeline need-company"],
  ["apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx", "BoardSection", "dispatch-loads-planner-need-company", "Dispatch Loads Planner need-company"],
  ["apps/frontend/src/pages/dispatch/planners/DriverPlanner.tsx", "BoardSection", "dispatch-driver-planner-need-company", "Dispatch Driver Planner need-company"],
  ["apps/frontend/src/pages/legal/alerts/LegalDeadlineAlertsPage.tsx", "BoardSection", "legal-deadline-alerts-need-company", "Legal Deadline Alerts need-company"],
  ["apps/frontend/src/pages/legal/matters/LegalMatterNewPage.tsx", "BoardSection", "legal-matter-new-need-company", "Legal Matter New need-company"],
  ["apps/frontend/src/pages/legal/reports/LegalReportsLandingPage.tsx", "BoardSection", "legal-reports-need-company", "Legal Reports need-company"],
  ["apps/frontend/src/pages/legal/LegalPoliciesPage.tsx", "BoardSection", "legal-policies-need-company", "Legal Policies need-company"],
  ["apps/frontend/src/pages/legal/LegalAttorneyReviewPage.tsx", "BoardSection", "legal-attorney-review-need-company", "Legal Attorney Review need-company"],
  ["apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx", "BoardSection", "legal-templates-need-company", "Legal Templates need-company"],
  ["apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx", "BoardSection", "legal-contracts-need-company", "Legal Contracts need-company"],
  ["apps/frontend/src/pages/home/DriverHubPage.tsx", "BoardSection", "driver-hub-need-company", "Driver Hub need-company"],
  ["apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx", "BoardSection", "legal-template-detail-need-company", "Legal Template Detail need-company"],
  ["apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx", "BoardSection", "legal-matter-detail-need-company", "Legal Matter Detail need-company"],
  ["apps/frontend/src/pages/factoring/SubmissionWorkqueue.tsx", "BoardSection", "factoring-submission-workqueue-need-company", "Factoring Submission Workqueue need-company"],
  ["apps/frontend/src/pages/dispatch/ExpenseLoadConfirmationsPage.tsx", "BoardSection", "expense-load-confirmations-page-need-company", "Expense Load Confirmations page need-company"],
  ["apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx", "BoardSection", "type-catalog-need-company", "Type Catalog need-company"],
  ["apps/frontend/src/pages/insurance/PaymentScheduleTab.tsx", "BoardSection", "insurance-payment-schedule-need-company", "Insurance Payment Schedule need-company"],
  ["apps/frontend/src/components/driver-inbox/DriverInbox.tsx", "BoardSection", "driver-inbox-need-company", "DriverInbox need-company"],
  ["apps/frontend/src/components/drivers/EarningsTab.tsx", "BoardSection", "driver-earnings-need-company", "EarningsTab need-company"],
  ["apps/frontend/src/components/expenses/ExpenseLoadConfirmationsBoard.tsx", "BoardSection", "expense-load-confirmations-need-company", "ExpenseLoadConfirmations need-company"],
  ["apps/frontend/src/pages/profitability/ByTypeView.tsx", "BoardSection", "profitability-by-type-need-company", "ByType need-company"],
  ["apps/frontend/src/pages/profitability/ByLaneView.tsx", "BoardSection", "profitability-by-lane-need-company", "ByLane need-company"],
  ["apps/frontend/src/pages/qbo/QBOSyncStatusDashboardPage.tsx", "BoardSection", "qbo-sync-status-need-company", "QboSyncStatus need-company"],
  ["apps/frontend/src/pages/lists/CatalogIndex.tsx", "BoardSection", "catalog-index-need-company", "CatalogIndex need-company"],
  ["apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx", "BoardSection", "driver-teams-need-company", "DriverTeams need-company"],
  ["apps/frontend/src/pages/units/UnitDetail.tsx", "BoardSection", "unit-detail-need-company", "UnitDetail need-company"],
  ["apps/frontend/src/pages/samsara-vendor-mapping/HosDriverMapPreviewPage.tsx", "BoardSection", "hos-driver-map-need-company", "HosDriverMap need-company"],
  ["apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx", "BoardSection", "daily-tasks-need-company", "DailyTasks need-company"],
  ["apps/frontend/src/pages/assets/AssetsWorkspacePage.tsx", "BoardSection", "assets-workspace-need-company", "AssetsWorkspace need-company"],
  ["apps/frontend/src/pages/onboarding/OnboardingWizard.tsx", "BoardSection", "onboarding-wizard-need-company", "OnboardingWizard need-company"],
];

const selftest = process.argv.includes("--selftest");

function analyze(sources) {
  const e = [];
  for (const [rel, tag, testId, label] of checks) {
    const src = sources[rel] ?? "";
    if (!src.includes(`<${tag}`) || !src.includes(`testId="${testId}"`)) {
      e.push(`${rel}: ${label} must use ${tag} (testId=${testId})`);
    }
  }
  return e;
}

const base = Object.fromEntries([...new Set(checks.map((c) => c[0]))].map((rel) => [rel, fs.readFileSync(rel, "utf8")]));

if (selftest) {
  const clean = analyze(base);
  if (clean.length) {
    console.error("SELFTEST FAIL live:\n- " + clean.join("\n- "));
    process.exit(1);
  }
  const planted = {
    ...base,
    "apps/frontend/src/pages/factoring/FactoringHome.tsx": base["apps/frontend/src/pages/factoring/FactoringHome.tsx"].replace(/<BoardSection/g, "<div"),
  };
  if (!analyze(planted).length) {
    console.error("SELFTEST FAIL plant escaped");
    process.exit(1);
  }
  console.log("PASS verify-fill-shell-empty-states --selftest");
  process.exit(0);
}

const fails = analyze(base);
if (fails.length) {
  console.error("FAIL verify-fill-shell-empty-states");
  fails.forEach((f) => console.error("- " + f));
  process.exit(1);
}
console.log("PASS verify-fill-shell-empty-states");
