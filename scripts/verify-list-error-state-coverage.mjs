#!/usr/bin/env node
/**
 * verify-list-error-state-coverage.mjs  (0243-g8-5 / pattern-3 — no "blank forever / false-empty" on outage)
 *
 * Owner root cause: a list/query page that renders a loading branch but NO error branch shows an outage as a
 * fake "No records" / $0 — the "blank forever spinner / looks broken" complaint. The canonical fix is an
 * `if (query.isError) return <ListErrorState .../>` (or an inline isError render), modeled on Vendors.tsx
 * (AUTO-13). This guard is a REGRESSION guard on the pages that HAVE been given honest error states, so they
 * "stay fixed" (skill §2 — every fix gets a guard).
 *
 * Each listed page must reference BOTH `isError` and `ListErrorState`. It does NOT try to detect every
 * query page missing an error branch (that false-fires on mutation-only pages) — the remaining rollout is
 * tracked in docs/trackers/DEFERRED-ITEMS.md.
 *
 * Usage:
 *   node scripts/verify-list-error-state-coverage.mjs            # scan
 *   node scripts/verify-list-error-state-coverage.mjs --selftest # regression -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

// Pages that MUST keep an honest error state (isError -> ListErrorState). Losing it is a regression.
const REQUIRED_ERROR_STATE = [
  "apps/frontend/src/pages/Vendors.tsx",
  "apps/frontend/src/pages/drivers/RetentionDashboard.tsx",
  "apps/frontend/src/pages/drivers/ApplicantsPipelinePage.tsx",
  "apps/frontend/src/pages/drivers/MessagesInboxPage.tsx",
  "apps/frontend/src/pages/drivers/DriversListPage.tsx",
  // TIER-3 batch 3 (safety / maintenance / legal list pages — honest error instead of false-empty "No records" on outage).
  "apps/frontend/src/pages/safety/ComplaintsPage.tsx",
  "apps/frontend/src/pages/safety/CompanyViolationsPage.tsx",
  "apps/frontend/src/pages/safety/DotInspectionsPage.tsx",
  "apps/frontend/src/pages/safety/FinesPage.tsx",
  "apps/frontend/src/pages/safety/PermitsPage.tsx",
  "apps/frontend/src/pages/maintenance/ServiceLocationPage.tsx",
  "apps/frontend/src/pages/maintenance/FaultRulesPage.tsx",
  "apps/frontend/src/pages/legal/LegalPoliciesPage.tsx",
  // TIER-3 batch 4 — direct-empty list pages given honest isError -> ListErrorState (no false-empty/false-$0 on outage).
  "apps/frontend/src/pages/accounting/SalesTaxPage.tsx",
  "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx",
  "apps/frontend/src/pages/accounting/CoaRolesPage.tsx",
  "apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx",
  "apps/frontend/src/pages/reports/BookingGapReport.tsx",
  "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx",
  "apps/frontend/src/pages/reports/CashFlowReport.tsx",
  "apps/frontend/src/pages/fleet/TransfersInProgressPage.tsx",
  // Audit / alerts — honest isError -> ListErrorState (WAR-290 / WAR-291 regression ratchet).
  "apps/frontend/src/pages/audit/AuditEventsList.tsx",
  "apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx",
  "apps/frontend/src/pages/dispatch/PodReviewPage.tsx",
  "apps/frontend/src/pages/reports/LateArrivalReport.tsx",
  "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx",
  "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
  "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
  "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
  "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
  // Inventory — honest isError -> ListErrorState (INBOX-298; standing P1 inventory module).
  "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx",
  "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function scan() {
  const failures = [];
  for (const rel of REQUIRED_ERROR_STATE) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full)) {
      failures.push(`${rel} — MISSING file (was a required list-error-state page)`);
      continue;
    }
    const src = stripComments(fs.readFileSync(full, "utf8"));
    const hasIsError = /\bisError\b/.test(src);
    const hasErrState = /\bListErrorState\b/.test(src);
    if (!hasIsError || !hasErrState) {
      failures.push(`${rel} — lost its honest error state (isError:${hasIsError}, ListErrorState:${hasErrState})`);
    }
  }
  return failures;
}

export function run() {
  const failures = scan();
  if (failures.length) {
    console.error("[verify-list-error-state-coverage] FAIL — a list page lost its honest error state:");
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  console.log(`[verify-list-error-state-coverage] PASS — ${REQUIRED_ERROR_STATE.length} list pages keep isError -> ListErrorState`);
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const good = `if (q.isError) return <ListErrorState status={0} onRetry={r}/>;`;
  const bad = `{q.isLoading ? <p>Loading…</p> : <Table/>}`;
  const has = (s) => /\bisError\b/.test(s) && /\bListErrorState\b/.test(s);
  if (!has(good)) {
    console.error("[verify-list-error-state-coverage] SELFTEST FAIL — good error state not recognized");
    process.exit(1);
  }
  if (has(bad)) {
    console.error("[verify-list-error-state-coverage] SELFTEST FAIL — loading-only page counted as having error state");
    process.exit(1);
  }
  console.log("[verify-list-error-state-coverage] SELFTEST PASS — requires isError + ListErrorState; flags loading-only");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
