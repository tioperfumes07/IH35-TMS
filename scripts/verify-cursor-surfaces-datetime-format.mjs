#!/usr/bin/env node
/**
 * Shell QA — Cursor-seat datetime cells must use formatDateTimeUS, not browser toLocaleString.
 */
import fs from "node:fs";

const LABEL = "verify-cursor-surfaces-datetime-format";
const FILES = [
  "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
  "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
  "apps/frontend/src/pages/dispatch/LoadHistoryPage.tsx",
  "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx",
  "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
  "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
  "apps/frontend/src/pages/fuel/components/CompliancePanel.tsx",
  "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
  "apps/frontend/src/pages/driver-finance/components/CloseTripPanel.tsx",
  "apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx",
  // fill-not-shell datetime wave — FactoringTab timestamps
  "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx",
  "apps/frontend/src/components/dispatch/TourSettlementTab.tsx",
  "apps/frontend/src/components/drivers/DriverCommunicationsTab.tsx",
  "apps/frontend/src/components/driver-profile/DriverProfileFuelVerdictsSection.tsx",
  "apps/frontend/src/pages/legal/LegalAttorneyReviewPage.tsx",
  "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx",
  "apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx",
  "apps/frontend/src/pages/legal/attorney-review/LegalAttorneyReviewPortalPage.tsx",
  "apps/frontend/src/pages/tasks/ReconcilerExceptionsPage.tsx",
  "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
  "apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx",
  "apps/frontend/src/components/dispatch/LoadBolPanel.tsx",
  "apps/frontend/src/components/dispatch/LoadLivePositionCell.tsx",
  "apps/frontend/src/components/dispatch/LoadDetailGeofenceTimelineTab.tsx",
  "apps/frontend/src/components/dispatch/LoadStopsRecordTab.tsx",
  "apps/frontend/src/components/dispatch/LoadAuditTab.tsx",
  "apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx",
  "apps/frontend/src/components/drivers/AuditHistoryTab.tsx",
  "apps/frontend/src/pages/home/OwnerHome.tsx",
  "apps/frontend/src/pages/home/roles/AccountingHome.tsx",
  "apps/frontend/src/pages/home/roles/DefaultHome.tsx",
  "apps/frontend/src/components/dispatch/DispatchList.tsx",
  // CRM/Drivers/Fleet identity datetime wave
  "apps/frontend/src/pages/CustomerDetail.tsx",
  "apps/frontend/src/pages/Drivers.tsx",
  "apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx",
  "apps/frontend/src/pages/customers/CoiTab.tsx",
  "apps/frontend/src/pages/customers/components/PortalUsersTab.tsx",
  "apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx",
  "apps/frontend/src/pages/vendors/VendorsSyncPanel.tsx",
  "apps/frontend/src/pages/customers/CustomersSyncPanel.tsx",
  "apps/frontend/src/components/customers/FreeTimeDetentionEditor.tsx",
  "apps/frontend/src/components/customers/FMCSAVerificationModal.tsx",
  "apps/frontend/src/components/tasks/TasksTab.tsx",
  "apps/frontend/src/components/compliance/NotificationLogPanel.tsx",
  "apps/frontend/src/components/shared/ValidationPanel.tsx",
  "apps/frontend/src/components/users/UserActivityTab.tsx",
  "apps/frontend/src/components/documents/VersionHistoryModal.tsx",
  "apps/frontend/src/components/documents/PreviewModal.tsx",
  "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
  "apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx",
  "apps/frontend/src/pages/integrations/SamsaraIntegrationPage.tsx",
  "apps/frontend/src/pages/forensic/ForensicReviewPage.tsx",
  "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx",
  "apps/frontend/src/pages/qbo-sync-detail/QboSyncDetailPage.tsx",
  "apps/frontend/src/lib/qbo-sync-last-success-label.ts",
];

const DATE_ONLY = [
  "apps/frontend/src/components/dispatch/TourSettlementTab.tsx",
  "apps/frontend/src/components/fuel/FuelCardOverageReverseSection.tsx",
  "apps/frontend/src/components/dispatch/FleetOosStrip.tsx",
  "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  "apps/frontend/src/pages/docs/DocsHomePage.tsx",
  "apps/frontend/src/components/dispatch/LoadDetailSettlementTab.tsx",
  "apps/frontend/src/components/dispatch/tabs/LdtDocumentsTab.tsx",
  "apps/frontend/src/pages/home/QboStyleHomePage.tsx",
  "apps/frontend/src/pages/VendorDetail.tsx",
  "apps/frontend/src/lib/oos-display.ts",
  "apps/frontend/src/components/loads/MilesRecommendationsPanel.tsx",
  // LocationsListPage.tsx removed 2026-11-02: GLB-08 mandates mmmDd (not formatDateUS) for this
  // date-only table; the guard contradiction was between DATE_ONLY (requiring formatDateUS) and
  // verify-glb08-mmm-dd-sweep (banning it). TABLE_DATE_OMIT comment confirms no datetime cells.
  "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx",
  "apps/frontend/src/pages/cash-advances/components/CashAdvancesKpiRow.tsx",
];

const QUANTITY = [
  "apps/frontend/src/components/boards/DriverOverviewBoard.tsx",
  "apps/frontend/src/components/boards/DriverHubBoard.tsx",
  "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
  "apps/frontend/src/components/dispatch/TourLoadRows.tsx",
  "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
  "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx",
  "apps/frontend/src/components/dispatch/TourMilesPanel.tsx",
  "apps/frontend/src/components/dispatch/TourPreSettlementTab.tsx",
  "apps/frontend/src/components/dispatch/TourSettlementTab.tsx",
  "apps/frontend/src/components/dispatch/LoadUnitCostSplitPanel.tsx",
  "apps/frontend/src/components/dispatch/DeadheadOptimizerPanel.tsx",
  "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
  "apps/frontend/src/components/dispatch/LoadStopsRecordTab.tsx",
  "apps/frontend/src/components/fuel/RelayFillsReverseSection.tsx",
  "apps/frontend/src/pages/Customers.tsx",
  "apps/frontend/src/pages/Vendors.tsx",
  "apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx",
  "apps/frontend/src/pages/settlements/CreatorMilesChoicePanel.tsx",
  "apps/frontend/src/components/vendors/VendorProfileOverview.tsx",
  "apps/frontend/src/components/FleetTable.tsx",
  "apps/frontend/src/lib/odometerHonesty.ts",
  "apps/frontend/src/components/loads/MilesRecommendationsPanel.tsx",
  "apps/frontend/src/components/driver-profile/DriverLiveOverview.tsx",
  "apps/frontend/src/components/CappedListNotice.tsx",
  "apps/frontend/src/pages/profitability/money.ts",
  "apps/frontend/src/pages/lists/MaintenanceServicesCatalog.tsx",
  "apps/frontend/src/components/shared/SidebarPagination.tsx",
  "apps/frontend/src/pages/system/SystemModulePage.tsx",
];

const MONEY_CENTS = [
  "apps/frontend/src/components/driver-profile/SettlementsSection.tsx",
  "apps/frontend/src/pages/payroll-integration/PayrollIntegrationPage.tsx",
  "apps/frontend/src/pages/payroll-integration/PayrollAggregateTable.tsx",
  "apps/frontend/src/pages/payroll-integration/ClassAllocationView.tsx",
  "apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx",
];

const MONEY = [
  "apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx",
];

const fails = [];
for (const path of FILES) {
  const src = fs.readFileSync(path, "utf8");
  if (!/formatDateTimeUS/.test(src)) {
    fails.push(`${path}: must import/use formatDateTimeUS`);
  }
  // Date-time cells only — allow number toLocaleString for miles/counts.
  if (/new Date\([^)]+\)\.toLocaleString\(/.test(src)) {
    fails.push(`${path}: must not new Date(...).toLocaleString()`);
  }
}
for (const path of DATE_ONLY) {
  const src = fs.readFileSync(path, "utf8");
  if (!/formatDateUS/.test(src)) {
    fails.push(`${path}: must import/use formatDateUS`);
  }
  if (/toLocaleDateString\(/.test(src)) {
    fails.push(`${path}: must not toLocaleDateString()`);
  }
}
for (const path of QUANTITY) {
  const src = fs.readFileSync(path, "utf8");
  if (!/formatQuantityTable/.test(src)) {
    fails.push(`${path}: must import/use formatQuantityTable`);
  }
  if (/toLocaleString\(["']en-US["']\)/.test(src)) {
    fails.push(`${path}: must not quantity toLocaleString("en-US")`);
  }
}

for (const path of MONEY) {
  const src = fs.readFileSync(path, "utf8");
  if (!/formatUsdCentsTable/.test(src)) {
    fails.push(`${path}: must import/use formatUsdCentsTable`);
  }
  if (/toLocaleString\(["']en-US["']/.test(src)) {
    fails.push(`${path}: must not money toLocaleString("en-US")`);
  }
}

for (const path of MONEY_CENTS) {
  const src = fs.readFileSync(path, "utf8");
  if (!/formatUsdCents/.test(src)) {
    fails.push(`${path}: must import/use formatUsdCents`);
  }
  if (/toLocaleString\(/.test(src)) {
    fails.push(`${path}: must not money toLocaleString()`);
  }
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = fs.readFileSync(FILES[0], "utf8").replace(/formatDateTimeUS/g, "toLocaleString");
  if (!/toLocaleString/.test(plant) || /formatDateTimeUS/.test(plant)) {
    console.error(`${LABEL} --selftest FAIL plant weak`);
    process.exit(1);
  }
  const datePlant = fs.readFileSync(DATE_ONLY[0], "utf8").replace(/formatDateUS/g, "toLocaleDateString");
  if (!/toLocaleDateString/.test(datePlant) || /formatDateUS/.test(datePlant)) {
    console.error(`${LABEL} --selftest FAIL date-only plant weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Cursor surfaces use formatDateTimeUS`);
