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
