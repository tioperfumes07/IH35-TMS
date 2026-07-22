#!/usr/bin/env node
/**
 * CHROME-02 — QBO-style filter collapse guard.
 * Ensures Safety, UniversalFilterBar, Customers, and Vendors keep filters behind a Filters popover —
 * not always-on chip strips or stub Filters buttons.
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
if (!safety.includes("filtersOpen")) {
  failures.push("SafetyDashboardFilter: missing filtersOpen gate");
}

// UniversalFilterBar — Filters must open a real panel; From/To not always-on
const universal = read("apps/frontend/src/components/planner/UniversalFilterBar.tsx");
if (!universal.includes("filtersOpen")) {
  failures.push("UniversalFilterBar: missing filtersOpen — Filters button must toggle a panel");
}
if (!universal.includes("data-testid=\"planner-filters-panel\"")) {
  failures.push("UniversalFilterBar: missing planner-filters-panel test id");
}
if (/>\s*Filters ▼\s*</.test(universal)) {
  failures.push("UniversalFilterBar: stub 'Filters ▼' button still present");
}
// From/To must not be always-on in the slim toolbar (live inside popover).
const universalToolbar = universal.split("return (")[1]?.split("{filtersOpen ?")[0] ?? universal;
if (/>\s*From\s*</.test(universalToolbar) && /<DatePicker/.test(universalToolbar)) {
  failures.push("UniversalFilterBar: From/To DatePickers still always-on in toolbar");
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
]) {
  const src = read(rel);
  if (!src.includes("CollapsedListFilters")) {
    failures.push(`${rel}: must use CollapsedListFilters`);
  }
  if (!src.includes(marker)) {
    failures.push(`${rel}: missing ${marker} collapsed marker`);
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
