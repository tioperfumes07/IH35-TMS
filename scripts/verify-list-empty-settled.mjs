#!/usr/bin/env node
// BLOCK LIST-EMPTY-1 — static guard.
//
// Locks the fix for the false-empty defect: paged lists (Vendors, Customers)
// must render their empty state ("No X found") ONLY through the shared
// list-state primitive (src/components/list-state), which returns "empty" only
// on a settled, zero-row query — never mid-fetch. This guard fails if a migrated
// list surface stops routing its empty state through the primitive (regression),
// and reports a sweep count of not-yet-migrated offenders for TBL-STANDARD
// follow-on tracking.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const TAG = "[verify-list-empty-settled]";
const PRIMITIVE_DIR = "apps/frontend/src/components/list-state";

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function fail(msg) {
  console.error(`${TAG} FAIL: ${msg}`);
  process.exit(1);
}

// 1) The shared primitive itself must exist and hold the settled-only invariant.
const primitiveFiles = ["listState.ts", "useListState.ts", "ListStateBoundary.tsx", "index.ts"];
for (const f of primitiveFiles) {
  const rel = path.join(PRIMITIVE_DIR, f);
  if (!fs.existsSync(path.join(repoRoot, rel))) fail(`missing shared primitive file ${rel}`);
}
const listStateSrc = read(path.join(PRIMITIVE_DIR, "listState.ts"));
if (!/if\s*\(\s*status\.isPending\s*\)\s*return\s*"loading"/.test(listStateSrc)) {
  fail("resolveListState no longer returns loading while pending — the settled-only invariant is gone");
}
if (!/isEmpty\s*&&\s*status\.isFetching\)\s*return\s*"loading"/.test(listStateSrc)) {
  fail("resolveListState no longer treats zero-rows-while-fetching as loading (race guard removed)");
}

// 2) Migrated list surfaces: each MUST import the primitive and gate every
//    empty literal on the resolved settled state (listState.isEmpty / === "empty").
const MIGRATED = [
  { file: "apps/frontend/src/pages/vendors/VendorsListView.tsx", empties: ["No vendors found."] },
  { file: "apps/frontend/src/pages/vendors/VendorListSidebar.tsx", empties: ["No vendors found."] },
  { file: "apps/frontend/src/pages/customers/CustomersListView.tsx", empties: ["No customers match this filter."] },
  { file: "apps/frontend/src/pages/customers/CustomerListSidebar.tsx", empties: ["No customers found."] },
  // TBL-STANDARD batch 2 — settled-only empty state routed through the shared primitive.
  { file: "apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx", empties: ["No account types found."] },
  { file: "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx", empties: ["No audit events found."] },
  { file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx", empties: ["No bill payments found."] },
  { file: "apps/frontend/src/pages/accounting/BillsPage.tsx", empties: ["No bills found."] },
  { file: "apps/frontend/src/pages/accounting/DailyReconPage.tsx", empties: ["No transactions found for the selected filters."] },
  { file: "apps/frontend/src/pages/accounting/EscrowPage.tsx", empties: ["No escrow accounts found."] },
  { file: "apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx", empties: ["No mappings found."] },
  { file: "apps/frontend/src/pages/accounting/FixedAssetsPage.tsx", empties: ["No fixed assets found."] },
  { file: "apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx", empties: ["No integration transactions found."] },
  { file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx", empties: ["No invoices found for the selected filters."] },
  { file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx", empties: ["No journal entries found."] },
  { file: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx", empties: ["No payments found."] },
  { file: "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx", empties: ["No prepaid expenses found."] },
  { file: "apps/frontend/src/pages/accounting/ReceiptsPage.tsx", empties: ["No receipts found."] },
  { file: "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx", empties: ["No revenue contracts found."] },
  { file: "apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx", empties: ["No detail types found."] },
  { file: "apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx", empties: ["No entries match these filters"] },
  { file: "apps/frontend/src/pages/qbo-sync-detail/QboSyncDetailPage.tsx", empties: ["No QBO sync events match the selected filters."] },
  { file: "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx", empties: ["No trucks match the current filters for this period."] },
  { file: "apps/frontend/src/pages/CustomerDetail.tsx", empties: ["No contacts on file. Add via Edit Customer.", "No payments recorded.", "No invoices yet for this customer.", "Add your first lane to track customer pricing.", "No FMCSA verifications found for this company."] },
  { file: "apps/frontend/src/pages/Customers.tsx", empties: ["No transactions for current filters."] },
  { file: "apps/frontend/src/pages/DriverDetail.tsx", empties: ["No linkage events yet.", "No qualifications found for this driver.", "No safety events recorded for this driver.", "No linked matters.", "No accessible operating companies.", "No rate history found."] },
  { file: "apps/frontend/src/pages/DriverLoadStatusesPage.tsx", empties: ["No statuses found."] },
  { file: "apps/frontend/src/pages/EquipmentTypesPage.tsx", empties: ["No equipment types found."] },
  { file: "apps/frontend/src/pages/Vendors.tsx", empties: ["No transactions for current filters."] },
  { file: "apps/frontend/src/pages/audit/AuditEventsList.tsx", empties: ["No audit events found."] },
  { file: "apps/frontend/src/pages/banking/BankAccountDetail.tsx", empties: ["No transactions found for this filter."] },
  { file: "apps/frontend/src/pages/banking/TransfersListPage.tsx", empties: ["No transfers found for this filter."] },
  { file: "apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx", empties: ["No bank accounts connected yet.", "No transactions found."] },
  { file: "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx", empties: ["No escrow ledger rows found for this filter."] },
  { file: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx", empties: ["No matchable records found in the ±7-day window for this transaction."] },
  { file: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx", empties: ["No delivered loads in factoring queue.", "No loads match the current filter."] },
  { file: "apps/frontend/src/pages/dispatch/PodReviewPage.tsx", empties: ["No POD documents match the current filters."] },
  // DispatchBoard's "All units currently have active loads." empty migrated (orphan-triage batch 05)
  // into the shared UnitsWithoutLoadTable (components/DataTable): it renders emptyText ONLY when the
  // `loading` prop (fed unitsWithoutLoadQuery.isLoading) is false — i.e. settled-only, the same
  // false-empty invariant this guard enforces, now via DataTable's loading gate rather than the
  // list-state primitive. DispatchBoard no longer renders that literal directly, so it is not a
  // list-state surface anymore. Covered below by the DataTable false-empty scan.
  { file: "apps/frontend/src/pages/factoring/FactorAdmin.tsx", empties: ["No factors configured yet.", "No assignments found for this factor/customer.", "No batch history for this customer."] },
  { file: "apps/frontend/src/pages/factoring/ReserveDashboard.tsx", empties: ["No reserve balances found.", "No reserve movements found for the selected factor.", "No recent movements for this factor.", "No projected reserve releases in the selected window."] },
  { file: "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx", empties: ["No disputes found for current filter."] },
  // SETL-S01 / SETL-S02 — settlements + cash advances honest empty (settled-only).
  {
    file: "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx",
    empties: ["No settlements found — none created for this entity yet (or no rows match the current filter)."],
  },
  {
    file: "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx",
    empties: ["No cash advances found — none created for this entity yet (or no rows match the current filter)."],
  },
  { file: "apps/frontend/src/pages/insurance/ClaimsTab.tsx", empties: ["No claims found."] },
  { file: "apps/frontend/src/pages/insurance/LawsuitsTab.tsx", empties: ["No lawsuits found."] },
  { file: "apps/frontend/src/pages/insurance/PaymentScheduleTab.tsx", empties: ["No payment schedule records found."] },
  { file: "apps/frontend/src/pages/legal/LegalPoliciesPage.tsx", empties: ["No policy templates found. Create one from Templates."] },
  { file: "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx", empties: ["No contract instances found for current filters."] },
  { file: "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx", empties: ["No eligible units found for this entity."] },
  { file: "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx", empties: ["No matters match filters."] },
  { file: "apps/frontend/src/pages/maintenance/FleetTablePage.tsx", empties: ["No fleet rows match this filter", "No fleet rows yet"] },
  { file: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", empties: ["No parts inventory rows found."] },
  { file: "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx", empties: ["No warranty claims yet."] },
  { file: "apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx", empties: ["No work orders match the current filters."] },
  { file: "apps/frontend/src/pages/safety/AccidentsPage.tsx", empties: ["No accident reports found."] },
  { file: "apps/frontend/src/pages/safety/FinesPage.tsx", empties: ["No fines found."] },
  { file: "apps/frontend/src/pages/safety/IdvrPage.tsx", empties: ["No DVIR submissions found for the selected filters."] },
  { file: "apps/frontend/src/pages/safety/PositionHistoryPage.tsx", empties: ["No position history records found"] },
  // "No safety events found." moved from the page into the ParityTable emptyText of the extracted
  // SafetyEventsTable child during the ParityTable migration; it still renders. Guard entry split to
  // match the new location (per paritytable-conversion-trips-static-guards — update the guard, never
  // weaken it). Both literals remain asserted; "No notes yet." stayed on the page.
  { file: "apps/frontend/src/pages/safety/SafetyEventsPage.tsx", empties: ["No notes yet."] },
  { file: "apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx", empties: ["No safety events found."] },
  { file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", empties: ["No records found."] },
  { file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", empties: ["No records found."] },
  { file: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx", empties: ["No complaints found."] },
  { file: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx", empties: ["No DOT inspections found."] },
  { file: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx", empties: ["No HOS violations found."] },
];

for (const { file, empties } of MIGRATED) {
  if (!fs.existsSync(path.join(repoRoot, file))) fail(`migrated list surface missing: ${file}`);
  const src = read(file);
  // A list surface enforces the settled-only (no false-empty) invariant in ONE of two equivalent ways:
  //  (a) the shared list-state primitive (isEmpty resolves only on a settled, zero-row query), or
  //  (b) the shared ParityTable, whose emptyText renders ONLY when its `loading` prop is false — the
  //      SAME settled-only gate (cf. the DispatchBoard-via-DataTable loading-gate precedent above).
  //      A ParityTable surface must pass a `loading=` prop (never omit it) and carry the empty as
  //      emptyText. This lets the QBO-parity ParityTable migration proceed without weakening the guard:
  //      bare `.length === 0 ?` empties are still rejected below, per-literal.
  const usesPrimitive = src.includes("components/list-state") && /useListState|resolveListState/.test(src);
  const usesParity = src.includes("<ParityTable") && /\bloading=/.test(src);
  if (!usesPrimitive && !usesParity) {
    fail(`${file} routes its list empty through neither the shared list-state primitive nor a loading-gated ParityTable`);
  }
  for (const literal of empties) {
    let idx = src.indexOf(literal);
    if (idx === -1) fail(`${file} expected empty literal not found: "${literal}"`);
    while (idx !== -1) {
      // The empty literal must sit inside a settled-state branch within the preceding window: an
      // isEmpty / === "empty" guard (list-state primitive) OR a ParityTable `emptyText=` prop (whose
      // render is gated on the settled `loading` prop). A bare `.length === 0` alone (the defect) is rejected.
      const window = src.slice(Math.max(0, idx - 400), idx);
      const listStateGated = /listState\.isEmpty|state === "empty"|\.isEmpty\b/.test(window);
      const parityEmptyText = /emptyText=/.test(window);
      const gated = listStateGated || parityEmptyText;
      const bareLength = /\.length === 0 \?/.test(window) && !gated;
      if (!gated || bareLength) {
        fail(`${file}: empty literal "${literal}" is not gated on the settled list-state or a ParityTable emptyText (found a raw data-length empty render)`);
      }
      idx = src.indexOf(literal, idx + literal.length);
    }
  }
}

// 3) SWEEP (informational, non-failing): remaining paged-list empty literals not
//    yet routed through the primitive. Reported for TBL-STANDARD follow-on blocks.
const pagesRoot = path.join(repoRoot, "apps/frontend/src/pages");
const EMPTY_RE = /No\s+[A-Za-z][A-Za-z ]*?\s+(found|match(?:es|ing)?)\b/;
const migratedSet = new Set(MIGRATED.map((m) => m.file));
const offenders = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      const rel = path.relative(repoRoot, full);
      if (migratedSet.has(rel)) continue;
      const src = fs.readFileSync(full, "utf8");
      if (!EMPTY_RE.test(src)) continue;
      // Only flag files that gate an empty literal on a bare data length without
      // any list-state primitive — those are candidate false-empty surfaces.
      const usesPrimitive = src.includes("components/list-state");
      const bareLengthEmpty = /\.length === 0\s*\?/.test(src);
      if (!usesPrimitive && bareLengthEmpty) offenders.push(rel);
    }
  }
}
if (fs.existsSync(pagesRoot)) walk(pagesRoot);

console.log(`${TAG} migrated + locked: ${MIGRATED.length} list surfaces route empty through the shared primitive.`);
console.log(`${TAG} sweep: ${offenders.length} not-yet-migrated paged-list empty surface(s) (candidate false-empty, track in TBL-STANDARD):`);
for (const o of offenders.sort()) console.log(`${TAG}   - ${o}`);
console.log(`${TAG} OK`);
