#!/usr/bin/env node
/**
 * CHROME-02 — QBO-style filter collapse guard.
 * Ensures Safety, UniversalFilterBar, Customers, and Vendors keep filters behind a Filters popover —
 * not always-on chip strips or stub Filters buttons.
 * CHROME-04 extends coverage to the Customers/Vendors PAGE-HEADER roster filters (Status/Type/
 * Credit-status/Category), which sit above CustomersListView/VendorsListView and were the
 * still-DIRTY always-on chip strips the filter matrix (S3) flagged after CHROME-02 shipped.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const failures = [];

// Safety (CHROME-01) — must stay collapsed
const safety = read("apps/frontend/src/components/safety/SafetyDashboardFilter.tsx");
if (!safety.includes('data-safety-filter-toolbar="collapsed"')) {
  failures.push("SafetyDashboardFilter: missing data-safety-filter-toolbar=\"collapsed\"");
}
// CHROME-02: SafetyDashboardFilter delegates to the shared CollapsedListFilters gold pattern —
// the filtersOpen gate now lives there, not re-forked per module.
if (!safety.includes("CollapsedListFilters")) {
  failures.push("SafetyDashboardFilter: must use the shared CollapsedListFilters gold pattern");
}

// Dispatch FilterBar (CHROME-02 origin of the gold pattern) — must also delegate to the shared
// CollapsedListFilters component, proving there is exactly one popover/collapse implementation.
const dispatchFilterBar = read("apps/frontend/src/components/dispatch/FilterBar.tsx");
if (!dispatchFilterBar.includes("CollapsedListFilters")) {
  failures.push("Dispatch FilterBar: must delegate to the shared CollapsedListFilters gold pattern");
}

// UniversalFilterBar (CHROME-05) — must delegate to the shared CollapsedListFilters
// gold pattern (Dispatch FilterBar), not a bespoke popover with always-on From/To chrome.
const universal = read("apps/frontend/src/components/planner/UniversalFilterBar.tsx");
if (!universal.includes("CollapsedListFilters")) {
  failures.push("UniversalFilterBar: must use the shared CollapsedListFilters gold pattern");
}
if (!universal.includes("data-testid=\"planner-filters-panel\"") && !/testIdPrefix="planner"/.test(universal)) {
  failures.push("UniversalFilterBar: missing planner Filters popover test id wiring");
}
if (/>\s*Filters ▼\s*</.test(universal)) {
  failures.push("UniversalFilterBar: stub 'Filters ▼' button still present");
}
// Everything before <CollapsedListFilters ...> is the always-visible slim toolbar —
// From/To DatePickers and the period/date summary text must NOT render there.
const universalToolbar = universal.split("<CollapsedListFilters")[0] ?? universal;
if (/<DatePicker/.test(universalToolbar)) {
  failures.push("UniversalFilterBar: From/To DatePickers still always-on before the Filters popover");
}
if (/\{value\.from\}|\{value\.to\}/.test(universalToolbar)) {
  failures.push("UniversalFilterBar: from/to date text still always-on before the Filters popover");
}
if (/PRESET_LABELS\[value\.period\]/.test(universalToolbar)) {
  failures.push("UniversalFilterBar: period label still always-on before the Filters popover");
}

// Customers — chips collapsed; search stays visible
const customers = read("apps/frontend/src/pages/customers/CustomersListView.tsx");
if (!customers.includes("CollapsedListFilters")) {
  failures.push("CustomersListView: must use CollapsedListFilters (filters behind Filters button)");
}
if (/filterChips\.map/.test(customers.split("CollapsedListFilters")[0] ?? customers)) {
  failures.push("CustomersListView: filter chips still rendered outside CollapsedListFilters popover");
}
if (!customers.includes("data-customers-filter-toolbar")) {
  failures.push("CustomersListView: missing data-customers-filter-toolbar collapsed marker");
}

// Vendors — chips collapsed; search stays visible
const vendors = read("apps/frontend/src/pages/vendors/VendorsListView.tsx");
if (!vendors.includes("CollapsedListFilters")) {
  failures.push("VendorsListView: must use CollapsedListFilters (filters behind Filters button)");
}
if (/data-vendor-filter-chips="true"/.test(vendors.split("CollapsedListFilters")[0] ?? vendors)) {
  failures.push("VendorsListView: vendor filter chips still always-on outside popover");
}
if (!vendors.includes("data-vendors-filter-toolbar")) {
  failures.push("VendorsListView: missing data-vendors-filter-toolbar collapsed marker");
}

// CHROME-04 — Customers/Vendors PAGE-HEADER roster filters (Status/Type/Credit-status/Category)
// must also collapse behind CollapsedListFilters — these sit ABOVE CustomersListView/VendorsListView
// and were previously always-on chip strips + selects in the PageHeader actions row.
const customersPage = read("apps/frontend/src/pages/Customers.tsx");
if (!customersPage.includes("CollapsedListFilters")) {
  failures.push("Customers.tsx: roster Status/Type/Credit-status filters must use CollapsedListFilters");
}
if (!customersPage.includes("data-customers-roster-filter-toolbar")) {
  failures.push("Customers.tsx: missing data-customers-roster-filter-toolbar collapsed marker");
}
{
  const beforePopover = customersPage.split("CollapsedListFilters")[0] ?? customersPage;
  if (/data-list-status-filter="customers"/.test(beforePopover)) {
    failures.push("Customers.tsx: roster Status chips still always-on outside the Filters popover");
  }
}

const vendorsPage = read("apps/frontend/src/pages/Vendors.tsx");
if (!vendorsPage.includes("CollapsedListFilters")) {
  failures.push("Vendors.tsx: roster Status/Category filters must use CollapsedListFilters");
}
if (!vendorsPage.includes("data-vendors-roster-filter-toolbar")) {
  failures.push("Vendors.tsx: missing data-vendors-roster-filter-toolbar collapsed marker");
}
{
  const beforePopover = vendorsPage.split("CollapsedListFilters")[0] ?? vendorsPage;
  if (/data-list-status-filter="vendors"/.test(beforePopover)) {
    failures.push("Vendors.tsx: roster Status chips still always-on outside the Filters popover");
  }
}

// CHROME-03 — Accounting money lists collapse filters behind Filters popover
for (const [rel, marker] of [
  ["apps/frontend/src/pages/accounting/BillsPage.tsx", "data-bills-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/ExpensesListPage.tsx", "data-expenses-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/InvoicesListPage.tsx", "data-invoices-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/PaymentsListPage.tsx", "data-payments-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/ManualJEListPage.tsx", "data-manual-je-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx", "data-bill-payments-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/FactoringListPage.tsx", "data-factoring-filter-toolbar"],
  ["apps/frontend/src/pages/banking/TransfersListPage.tsx", "data-transfers-filter-toolbar"],
  ["apps/frontend/src/pages/maintenance/components/ArrivingSoonFilterBar.tsx", "data-arriving-soon-filter-toolbar"],
  ["apps/frontend/src/pages/drivers/SettlementDisputeList.tsx", "data-settlement-dispute-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/DisputeQueuePage.tsx", "data-dispute-queue-filter-toolbar"],
  ["apps/frontend/src/components/assets/AssetFiltersBar.tsx", "data-asset-filter-toolbar"],
  ["apps/frontend/src/pages/profitability/FilterBar.tsx", "data-profitability-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/TransactionRegisterPage.tsx", "data-transaction-register-filter-toolbar"],
  ["apps/frontend/src/pages/reports/runners/RunnerFilters.tsx", "data-runner-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/FixedAssetsPage.tsx", "data-fixed-assets-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx", "data-prepaid-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/DailyReconPage.tsx", "data-daily-recon-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx", "data-ap-aging-filter-toolbar"],
  ["apps/frontend/src/pages/dispatch/PodReviewPage.tsx", "data-pod-filter-toolbar"],
  ["apps/frontend/src/pages/dispatch/borders/BorderCrossingHistory.tsx", "data-border-crossing-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/ReceiptsPage.tsx", "data-receipts-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx", "data-integration-tx-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/AbandonmentQueuePage.tsx", "data-abandonment-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx", "data-revrec-filter-toolbar"],
  ["apps/frontend/src/pages/dispatch/TripProfitability.tsx", "data-trip-profit-filter-toolbar"],
  ["apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx", "data-audit-trail-filter-toolbar"],
  ["apps/frontend/src/pages/safety/tabs/AnomaliesTab.tsx", "data-anomalies-filter-toolbar"],
  ["apps/frontend/src/pages/lists/accounting/ItemsListPage.tsx", "data-items-filter-toolbar"],
  ["apps/frontend/src/pages/docs/DocsHomePage.tsx", "data-docs-filter-toolbar"],
  // CHROME-06 — Maint/Fleet/Ops leftovers (WO tables, Fleet TableControls children, RoadService,
  // Driver Reports, Maintenance KPI dashboard, DVIR defects inbox).
  ["apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx", "data-wo-filter-toolbar"],
  ["apps/frontend/src/pages/maintenance/RoadServiceList.tsx", "data-road-service-filter-toolbar"],
  ["apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx", "data-driver-reports-filter-toolbar"],
  ["apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx", "data-maint-kpi-filter-toolbar"],
  ["apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx", "data-defects-inbox-filter-toolbar"],
  ["apps/frontend/src/pages/maintenance/FleetTablePage.tsx", "data-fleet-page-filter-toolbar"],
]) {
  const src = read(rel);
  if (!src.includes("CollapsedListFilters")) {
    failures.push(`${rel}: must use CollapsedListFilters`);
  }
  if (!src.includes(marker)) {
    failures.push(`${rel}: missing ${marker} collapsed marker`);
  }
}

const workOrdersTable = read("apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx");
if (!workOrdersTable.includes('<EntityPicker') || !workOrdersTable.includes('kind="vendor"')) {
  failures.push("WorkOrdersTable: external vendor filter must use the company-scoped vendor picker");
}

const manualJeList = read("apps/frontend/src/pages/accounting/ManualJEListPage.tsx");
if (!manualJeList.includes("listCoaAccountsForJe") || !manualJeList.includes("<ReferenceSelect")) {
  failures.push("ManualJEListPage: account filter must use the entity-scoped chart picker");
}
if (manualJeList.includes('placeholder="Account ID (optional)"')) {
  failures.push("ManualJEListPage: account filter must not require a typed account id");
}
if (workOrdersTable.includes('placeholder="External vendor id…"')) {
  failures.push("WorkOrdersTable: external vendor filter must not require a typed vendor id");
}

// CHROME-06 — FleetTable (shared component) TableControls children collapse behind CollapsedListFilters
{
  const fleetTable = read("apps/frontend/src/components/FleetTable.tsx");
  if (!fleetTable.includes("CollapsedListFilters")) {
    failures.push("FleetTable.tsx: TableControls children must use CollapsedListFilters");
  }
  if (!fleetTable.includes("data-fleet-filter-toolbar")) {
    failures.push("FleetTable.tsx: missing data-fleet-filter-toolbar collapsed marker");
  }
}

// CHROME-12 — Receive Payment uses ParityDrawer (not centered Modal)
const payment = read("apps/frontend/src/pages/accounting/RecordPaymentModal.tsx");
if (/<Modal[\s/>]/.test(payment)) {
  failures.push("RecordPaymentModal: must use ParityDrawer, not Modal");
}
if (!/<ParityDrawer[\s/>]/.test(payment)) {
  failures.push("RecordPaymentModal: missing ParityDrawer shell");
}

if (failures.length) {
  console.error("FAIL verify-qbo-filter-collapse:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-qbo-filter-collapse — QBO filter collapse + Receive Payment drawer");
