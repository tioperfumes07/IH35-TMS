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

const maintenancePartsSrc = read("apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx");
if (!/partsQuery\.isError[\s\S]*?<ListErrorState[\s\S]*?partsQuery\.refetch\(\)/.test(maintenancePartsSrc)) {
  fail("Maintenance Parts must render a retryable ListErrorState before its empty table");
}
const attorneyReviewSrc = read("apps/frontend/src/pages/legal/LegalAttorneyReviewPage.tsx");
if (!/query\.isError[\s\S]*?<ListErrorState[\s\S]*?query\.refetch\(\)/.test(attorneyReviewSrc)) {
  fail("Legal Attorney Review must render a retryable ListErrorState before its empty queue");
}
const insurancePaymentScheduleSrc = read("apps/frontend/src/pages/insurance/PaymentScheduleTab.tsx");
const insurancePaymentScheduleErrorContract =
  /query\.isError\s*\?\s*\([\s\S]*?<ListErrorState[\s\S]*?userFacingApiError\(query\.error[\s\S]*?query\.refetch\(\)[\s\S]*?\)\s*:\s*\([\s\S]*?<ParityTable/;
if (!insurancePaymentScheduleErrorContract.test(insurancePaymentScheduleSrc)) {
  fail("Insurance Payment Schedule must render a retryable detailed error instead of its empty table");
}
const insuranceClaimsSrc = read("apps/frontend/src/pages/insurance/ClaimsTab.tsx");
const insuranceLawsuitsSrc = read("apps/frontend/src/pages/insurance/LawsuitsTab.tsx");
const insuranceListErrorContract =
  /query\.isError\s*\?\s*\([\s\S]*?<ListErrorState[\s\S]*?userFacingApiError\(query\.error[\s\S]*?onRetry=\{\(\) => void query\.refetch\(\)\}[\s\S]*?\)\s*:\s*\([\s\S]*?<ParityTable/;
if (!insuranceListErrorContract.test(insuranceClaimsSrc) || !insuranceListErrorContract.test(insuranceLawsuitsSrc)) {
  fail("Insurance Claims and Lawsuits must render detailed exact-query retry instead of their empty tables");
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
    empties: ["No settlements found."],
  },
  {
    file: "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx",
    empties: ["No cash advances found — none created for this entity yet (or no rows match the current filter)."],
  },
  { file: "apps/frontend/src/pages/insurance/ClaimsTab.tsx", empties: ["No claims found."] },
  { file: "apps/frontend/src/pages/insurance/LawsuitsTab.tsx", empties: ["No lawsuits match the applied filters."] },
  { file: "apps/frontend/src/pages/insurance/PaymentScheduleTab.tsx", empties: ["No payment schedule records found."] },
  { file: "apps/frontend/src/pages/legal/LegalPoliciesPage.tsx", empties: ["No policy templates found. Create one from Templates."] },
  { file: "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx", empties: ["No contract instances found for current filters."] },
  { file: "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx", empties: ["No eligible units found for this entity."] },
  { file: "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx", empties: ["No matters match filters."] },
  { file: "apps/frontend/src/pages/maintenance/FleetTablePage.tsx", empties: ["No fleet rows match this filter", "No fleet rows yet"] },
  { file: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", empties: ["No parts inventory rows found."] },
  {
    file: "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
    empties: ["No work orders found — none open for this entity yet (or no rows match the current filter)."],
  },
  // MAINT-S03 — Arriving Soon settled empty (ParityTable loading= + honest emptyText).
  {
    file: "apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx",
    empties: [
      "No units arriving with open issues for this entity — arrivals with shop-prep issues populate this queue as loads approach the yard.",
    ],
  },
  // MAINT-S07 — DVIR defects inbox settled empty.
  {
    file: "apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx",
    empties: ["No DVIR defects in this queue."],
  },
  // MAINT surface batch — settled ParityTable / list-state empties.
  {
    file: "apps/frontend/src/pages/maintenance/brakes/BrakeWearDashboard.tsx",
    empties: ["No brake positions projected for service within 30 days."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/compliance/Compliance425CPage.tsx",
    empties: ["No 425C-linked events found."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/components/MaintenanceDamageRegisterTab.tsx",
    empties: ["No damage reports on the formal register"],
  },
  {
    file: "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx",
    empties: ["No driver reports found."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/components/InTransitIssuesTable.tsx",
    empties: ["No in-transit issues in queue."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx",
    empties: ["No drivers found."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx",
    empties: [
      "No fault-driven drafts for this unit.",
      "No fault-driven draft work orders pending review.",
    ],
  },
  {
    file: "apps/frontend/src/pages/maintenance/FaultRulesPage.tsx",
    empties: ["No fault rules configured yet."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx",
    empties: ["No inspections logged yet."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx",
    empties: ["No drill-down rows for this filter window."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx",
    empties: ["No parts found."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx",
    empties: [
      "No parts on hand. Click + Record Purchase to track daily purchases. Anti-theft pattern: minimal stock kept on hand.",
    ],
  },
  {
    file: "apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx",
    empties: ["No engine runs recorded yet."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx",
    empties: ["No PM schedules yet."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx",
    empties: [
      "No major DVIR defects in this queue.",
      "No minor DVIR defects in this queue.",
      "No observation DVIR defects in this queue.",
    ],
  },
  {
    file: "apps/frontend/src/pages/maintenance/reports/MaintenanceReportsPage.tsx",
    empties: ["No rows for this report."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/tires/TireWearDashboard.tsx",
    empties: ["No tires projected for replacement within 30 days."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/TireProgramPage.tsx",
    empties: ["No tire events yet for this "],
  },
  {
    file: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
    empties: ["No roadside tickets found."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/ServiceLocationPage.tsx",
    empties: ["No active work orders. Open work orders are grouped here by service location."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx",
    empties: ["No severe repairs or OOS units"],
  },
  {
    file: "apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx",
    empties: ["No vehicles found."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx",
    empties: ["No vendors available."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/VendorDetailPage.tsx",
    empties: ["No linked work orders yet.", "No vendor invoices recorded."],
  },
  {
    file: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    empties: [
      "No posting preview lines.",
      "No bills are linked to this work order yet.",
      "No expenses are linked to this work order yet.",
    ],
  },
  { file: "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx", empties: ["No warranty claims yet."] },
  // LEGAL surfaces.
  {
    file: "apps/frontend/src/pages/legal/LegalAttorneyReviewPage.tsx",
    empties: ["No templates currently pending attorney review."],
  },
  {
    file: "apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx",
    empties: ["No legal templates found for current filters."],
  },
  {
    file: "apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx",
    empties: ["No prior versions.", "No audit events recorded."],
  },
  // INS tabs — settled empties.
  {
    file: "apps/frontend/src/pages/insurance/PoliciesList.tsx",
    empties: ["No insurance policies found for this entity yet."],
  },
  {
    file: "apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx",
    empties: ["No type catalog entries."],
  },
  {
    file: "apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx",
    empties: ["No uncovered units.", "No mismatched coverage requirements."],
  },
  // DISP surface batch — settled ParityTable empties (war noon).
  {
    file: "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx",
    empties: ["No late arrivals right now."],
  },
  {
    file: "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
    empties: ["No assignment history for current filters."],
  },
  {
    file: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
    empties: ["No at-risk or late loads right now."],
  },
  {
    file: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx",
    empties: ["No completed crossings yet."],
  },
  {
    file: "apps/frontend/src/pages/dispatch/borders/BorderCrossingHistory.tsx",
    empties: ["No border crossing events found for this period."],
  },
  {
    file: "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
    empties: ["No active detention accrual. Confirmed stop arrivals will appear after sync."],
  },
  {
    file: "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx",
    empties: ["No pending equipment transfer requests."],
  },
  {
    file: "apps/frontend/src/pages/operations/GeofencesPage.tsx",
    empties: ["No geofences configured yet. Use the form above to create one."],
  },
  {
    file: "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
    empties: ["No in-transit issues."],
  },
  {
    file: "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx",
    empties: ["No delivery confirmations logged yet."],
  },
  {
    file: "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx",
    empties: ["No pending OCR items. Forward a rate confirmation PDF to the intake webhook to enqueue."],
  },
  {
    file: "apps/frontend/src/pages/dispatch/TripProfitability.tsx",
    empties: ["No trips closed in this period."],
  },
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

if (process.argv.includes("--selftest")) {
  const lawsuitEntry = MIGRATED.find(({ file }) => file.endsWith("/insurance/LawsuitsTab.tsx"));
  const expected = lawsuitEntry?.empties[0];
  const source = lawsuitEntry ? read(lawsuitEntry.file) : "";
  const mutant = expected ? source.replace(expected, "No lawsuits found.") : source;
  if (!expected || !source.includes(expected) || mutant.includes(expected)) {
    fail("selftest did not reject the planted stale insurance-lawsuit empty-state literal");
  }
  const retryMutant = insurancePaymentScheduleSrc.replace("onRetry={() => void query.refetch()}", "onRetry={() => undefined}");
  if (insurancePaymentScheduleErrorContract.test(retryMutant)) {
    fail("selftest did not reject the planted Insurance Payment Schedule retry no-op");
  }
  for (const [name, candidate] of [["Claims", insuranceClaimsSrc], ["Lawsuits", insuranceLawsuitsSrc]]) {
    const mutant = candidate.replace("onRetry={() => void query.refetch()}", "onRetry={() => undefined}");
    if (insuranceListErrorContract.test(mutant)) fail(`selftest did not reject the planted Insurance ${name} retry no-op`);
  }
  console.log(`${TAG} SELFTEST OK — stale lawsuit copy and all three Insurance retry no-ops rejected`);
  process.exit(0);
}

for (const { file, empties } of MIGRATED) {
  if (!fs.existsSync(path.join(repoRoot, file))) fail(`migrated list surface missing: ${file}`);
  const src = read(file);
  // Narrative comments often quote the old broken empty copy. Preserve offsets while removing
  // comments so quoted prose cannot satisfy (or fail) the executable UI contract.
  const scanSrc = src
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length))
    .replace(/\/\/[^\n]*/g, (comment) => " ".repeat(comment.length));
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
    let idx = scanSrc.indexOf(literal);
    if (idx === -1) fail(`${file} expected empty literal not found: "${literal}"`);
    while (idx !== -1) {
      // The empty literal must sit inside a settled-state branch within the preceding window: an
      // isEmpty / === "empty" guard (list-state primitive) OR a ParityTable `emptyText=` prop (whose
      // render is gated on the settled `loading` prop). A bare `.length === 0` alone (the defect) is rejected.
      const window = scanSrc.slice(Math.max(0, idx - 400), idx);
      const listStateGated = /listState\.isEmpty|state === "empty"|\.isEmpty\b/.test(window);
      const parityEmptyText = /emptyText=/.test(window);
      // Some dual-view pages own an explicit loading → empty → rows state machine for their
      // non-table view. That is the same settled-only invariant and must not be rejected merely
      // because it does not instantiate the shared table for the alternate view.
      const explicitLoadingGate = /\b(?:isLoading|isPending)\s*\?\s*\([\s\S]{0,400}?\.length === 0\s*\?/.test(window);
      const gated = listStateGated || parityEmptyText || explicitLoadingGate;
      const bareLength = /\.length === 0 \?/.test(window) && !gated;
      if (!gated || bareLength) {
        fail(`${file}: empty literal "${literal}" is not gated on the settled list-state or a ParityTable emptyText (found a raw data-length empty render)`);
      }
      idx = scanSrc.indexOf(literal, idx + literal.length);
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
