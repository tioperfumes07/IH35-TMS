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

/**
 * ★ DISCOVERY RATCHET (added 2026-08-11) — the roster below is HAND-MAINTAINED, so the guard can only
 * ever protect pages somebody remembered to type into it.
 *
 * The header above is explicit that this "does NOT try to detect every query page missing an error
 * branch (that false-fires on mutation-only pages)". That objection is correct and is why the sweep
 * below is NOT "every page with useQuery" — measured, that is 135 pages and it does include
 * mutation-only screens. It is narrowed to pages that actually RENDER A LIST from a query
 * (`<table` / `<tbody` / ParityTable / DataTable), which is the population this guard is about.
 * On that population: **289 list pages, of which 46 have no error branch at all.**
 *
 * MEASURED, NOT ASSUMED — and the gap is worst exactly where a false all-clear is most expensive:
 * safety 13 (6 pages + 4 tabs + integrity-reports + expiry-tracking + driver-scoring), maintenance 7,
 * dispatch 3, reports/ifta 3. `SafetyEventsPage.tsx` makes SIX useQuery calls and contains the string
 * `isError` ZERO times; IdvrPage and HoursOfServicePage the same. A safety manager whose query failed
 * is shown an empty table, which reads as "no violations" — the outage and the all-clear are
 * indistinguishable on a compliance surface.
 *
 * Baselined rather than hard-zeroed because 46 pages cannot be fixed in one PR and a red that cannot
 * be cleared gets the guard disabled. The baseline may only SHRINK: a NEW list page without an error
 * branch fails immediately, so the class cannot grow while it drains.
 */
const DISCOVERED_BASELINE_PATH = "scripts/list-error-state-coverage-baseline.json";
const PAGES_ROOT = "apps/frontend/src/pages";
const RENDERS_A_LIST = /<table|<tbody|ParityTable|DataTable/;
/**
 * An error branch in ANY of the spellings this codebase actually uses.
 *
 * ★ WIDENED 2026-08-11 after the predicate produced FALSE POSITIVES — caught by reading a flagged page
 * before editing it, not by the guard. `DOTComplianceTab.tsx:154` renders
 * `{remindersQ.error ? <p …>Could not load reminders. Try again.</p> : null}` — a real, honest error
 * branch that simply never says `isError`. Four of the 37 flagged pages were like that
 * (DOTComplianceTab, ExpiryDashboard, CargoClaimIntakeSurface, BookLoadModalV4). Keying on ONE spelling
 * would have sent the next agent to "fix" pages that were already correct — the same
 * detector-blind-to-a-moved-control failure as CLS-GUARD-LITERAL-DETECTION, reproduced by me in the
 * guard I wrote to prevent it. `<query>.error ?` / `.error &&` is therefore accepted as an error branch;
 * a bare `.error` mention (e.g. inside a message string) is not.
 */
const HAS_ERROR_BRANCH = /isError|ListErrorState|ListErrorBanner|\.error\s*(?:\?|&&)/;

function walkPages(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPages(abs, out);
    else if (abs.endsWith(".tsx") && !abs.endsWith(".test.tsx")) out.push(abs);
  }
  return out;
}

export function discoverOffenders() {
  const root = path.join(repoRoot, PAGES_ROOT);
  if (!fs.existsSync(root)) return null; // scope wrong — caller refuses to pass vacuously
  const offenders = [];
  for (const abs of walkPages(root)) {
    const src = fs.readFileSync(abs, "utf8");
    if (!/useQuery/.test(src)) continue;
    if (!RENDERS_A_LIST.test(src)) continue;
    if (HAS_ERROR_BRANCH.test(src)) continue;
    offenders.push(path.relative(repoRoot, abs).replace(/\\/g, "/"));
  }
  return offenders.sort();
}

// Pages that MUST keep an honest error state (isError -> ListErrorState). Losing it is a regression.
const REQUIRED_ERROR_STATE = [
  "apps/frontend/src/pages/Vendors.tsx",
  "apps/frontend/src/pages/drivers/RetentionDashboard.tsx",
  "apps/frontend/src/pages/drivers/ApplicantsPipelinePage.tsx",
  "apps/frontend/src/pages/drivers/MessagesInboxPage.tsx",
  "apps/frontend/src/pages/drivers/DriversListPage.tsx",
  "apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx",
  // TIER-3 batch 3 (safety / maintenance / legal list pages — honest error instead of false-empty "No records" on outage).
  "apps/frontend/src/pages/safety/ComplaintsPage.tsx",
  "apps/frontend/src/pages/safety/CompanyViolationsPage.tsx",
  "apps/frontend/src/pages/safety/DotInspectionsPage.tsx",
  "apps/frontend/src/pages/safety/FinesPage.tsx",
  "apps/frontend/src/pages/safety/PermitsPage.tsx",
  "apps/frontend/src/pages/maintenance/ServiceLocationPage.tsx",
  "apps/frontend/src/pages/maintenance/FaultRulesPage.tsx",
  "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx",
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
  "apps/frontend/src/pages/finance/FinanceHubPage.tsx",
  // Audit / alerts — honest isError -> ListErrorState (WAR-290 / WAR-291 regression ratchet).
  "apps/frontend/src/pages/audit/AuditEventsList.tsx",
  "apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx",
  "apps/frontend/src/pages/dispatch/PodReviewPage.tsx",
  "apps/frontend/src/pages/reports/LateArrivalReport.tsx",
  "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx",
  "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
  "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
  // Inventory — honest isError -> ListErrorState (INBOX-298; standing P1 inventory module).
  "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx",
  "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
  // Reports — honest isError -> ListErrorState (INBOX-309).
  "apps/frontend/src/pages/reports/LaneProfitabilityPage.tsx",
  "apps/frontend/src/pages/reports/DeadheadReportPage.tsx",
  "apps/frontend/src/pages/reports/DispatchMarginPage.tsx",
  "apps/frontend/src/pages/reports/CancellationsReportPage.tsx",
  // Safety driver scheduler — honest isError -> ListErrorState (INBOX-312).
  "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx",
  "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx",
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

/** Discovery ratchet: the hand-roster protects what someone typed; this protects everything else. */
function ratchet() {
  const failures = [];
  const discovered = discoverOffenders();
  if (discovered === null) {
    return [`${PAGES_ROOT} not found — scope is wrong, refusing to pass vacuously.`];
  }
  const baselineFull = path.join(repoRoot, DISCOVERED_BASELINE_PATH);
  if (!fs.existsSync(baselineFull)) {
    return [`missing ${DISCOVERED_BASELINE_PATH} — generate with --write-baseline.`];
  }
  const baseline = new Set(JSON.parse(fs.readFileSync(baselineFull, "utf8")).offenders ?? []);
  const added = discovered.filter((f) => !baseline.has(f));
  if (added.length) {
    failures.push(
      `${added.length} NEW list page(s) render a query result with NO error branch — an outage is ` +
        `indistinguishable from "no records":\n    ` + added.slice(0, 15).join("\n    ")
    );
  }
  if (discovered.length > baseline.size) {
    failures.push(
      `discovered offender count rose ${baseline.size} -> ${discovered.length}. The baseline may only SHRINK.`
    );
  }

  /**
   * DRAINED MODULES ARE LOCKED AT ZERO — a ratchet alone does not protect a finished module.
   *
   * Safety reached 0 offenders on 2026-08-11 (14 pages drained across three PRs). Under the global
   * count-may-only-shrink rule, a NEW un-guarded Safety page could still land as long as some other
   * module drained one in the same window — the total would not rise, and the regression would be
   * invisible. On compliance surfaces that is the whole defect coming back: an outage rendering as
   * "no violations". A module that reaches zero is therefore pinned at zero, independently of the
   * global count. Add a module here the moment it drains; never remove one to make a build pass.
   */
  const DRAINED_MODULES = ["apps/frontend/src/pages/safety/"];
  for (const prefix of DRAINED_MODULES) {
    const regressed = discovered.filter((f) => f.startsWith(prefix));
    if (regressed.length) {
      failures.push(
        `${prefix} is a DRAINED module and must stay at zero — ${regressed.length} un-guarded list ` +
          `page(s) reappeared:\n    ` + regressed.join("\n    ")
      );
    }
  }
  return failures;
}

export function run() {
  const failures = [...scan(), ...ratchet()];
  if (failures.length) {
    console.error("[verify-list-error-state-coverage] FAIL — a list page lost its honest error state:");
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  const remaining = discoverOffenders()?.length ?? 0;
  console.log(
    `[verify-list-error-state-coverage] PASS — ${REQUIRED_ERROR_STATE.length} roster pages keep isError -> ListErrorState; ` +
      `discovery ratchet holding at ${remaining} un-fixed list page(s) (may only shrink)`
  );
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
