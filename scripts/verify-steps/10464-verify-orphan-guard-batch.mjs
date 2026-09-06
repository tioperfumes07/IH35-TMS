// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; wires existing orphan guards into CI,
// does not ratchet an EntityLink/FK surface and claims no product Built credit.
// GUARD-WIRE-93 (Cursor, ROUND 12 — even lane, Rule 25/37; claim dd87bea4d1).
//
// Wires the 93 orphan verify-*.mjs guards that PASS standalone on tip 07f064a3a4
// into CI so they actually execute under `npm run verify:pre-commit`. Before this step
// classifyGuards() counted 107 guards unaccounted (orphan) and the census guards failed:
//   verify-wiring-law-guard-registry-batch            107 > 93
//   verify-tms-native-mixed-linkage-guard-registry-batch  107 > 91
// Executing these 93 here drops unaccounted 107 -> 14 (<= 91), turning both green.
//
// HARDLINE: the 14 ENV-CENSUS-FAIL guards (KNOWN_FAILING) are intentionally NOT wired —
// they stay orphan/OPEN until their owning seat fixes the underlying defect (never wire a red
// guard to force a green census). This file is machine-generated from the standalone sweep;
// verify-orphan-guard-batch --selftest fails if a member is missing or a red guard is smuggled in.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWN_FAILING } from "../lib/orphan-guard-known-failing.mjs";

const LABEL = "verify:orphan-guard-batch";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELF_REL = "scripts/verify-steps/10464-verify-orphan-guard-batch.mjs";

// The 93 orphan guards that exit 0 standalone (sorted). KNOWN_FAILING (the 14 red
// guards) is imported from scripts/lib so those filenames never enter the verify-steps corpus.
export const WIRED_GUARDS = [
  "verify-banking-plaid-category-suggestion.mjs",
  "verify-banking-reconcile-expense-candidate.mjs",
  "verify-bill-payments-void-biconditional.mjs",
  "verify-book-and-send-distributes-instructions.mjs",
  "verify-book-load-captures-border-crossing.mjs",
  "verify-box1-tax-year-uses-issued-date.mjs",
  "verify-cancellation-voids-expenses-and-advances.mjs",
  "verify-cash-advance-reversal-guard-fires.mjs",
  "verify-cash-flow-independent-of-proforma-timing.mjs",
  "verify-cash-flow-statement-live.mjs",
  "verify-cc3-ddl-handoff-retention-leave-safety.mjs",
  "verify-company-settlements-readmodel.mjs",
  "verify-counterparty-rollups-live.mjs",
  "verify-counterparty-side-search.mjs",
  "verify-counterparty-statements-foot-to-gl.mjs",
  "verify-counterparty-transactions-tab.mjs",
  "verify-customer-activity-statements.mjs",
  "verify-deadhead-pay-line-renders-on-settlement.mjs",
  "verify-dispatch-awaiting-unit-number-visible.mjs",
  "verify-dispatch-board-column-reorder.mjs",
  "verify-dispatch-board-default-columns-fit.mjs",
  "verify-dispatch-board-view-row.mjs",
  "verify-dispatch-breadcrumb-trip-pairing-round-trips.mjs",
  "verify-dispatch-empty-cell-dash.mjs",
  "verify-dispatch-home-tab-label.mjs",
  "verify-dispatch-invalid-transition-reason.mjs",
  "verify-dispatch-kanban-collapsed-lane-expander.mjs",
  "verify-dispatch-kanban-column-resize.mjs",
  "verify-dispatch-kanban-derived-lane-labeled.mjs",
  "verify-dispatch-kanban-no-unassigned-word.mjs",
  "verify-dispatch-kpi-centered-light.mjs",
  "verify-dispatch-no-navy-table-header.mjs",
  "verify-dispatch-oos-strip-archived.mjs",
  "verify-dispatch-overview-view-all-lands-on-list.mjs",
  "verify-dispatch-table-view-distinct.mjs",
  "verify-driver-bill-entitylink-never-routes-to-accounting-bills.mjs",
  "verify-driver-bill-linked-to-settlement-at-creation.mjs",
  "verify-driver-bill-number-no-b-prefix.mjs",
  "verify-driver-bills-in-bills-page.mjs",
  "verify-driver-bills-void-cascade-stamps-register.mjs",
  "verify-driver-instruction-sheet-no-pay.mjs",
  "verify-driver-liability-void-route-wired.mjs",
  "verify-driver-load-history.mjs",
  "verify-driver-profile-deductions-escrow-wired.mjs",
  "verify-drv14-dqf-report.mjs",
  "verify-duplicate-masters-report.mjs",
  "verify-edit-load-assigned-driver-not-draft.mjs",
  "verify-edit-load-prefill-reset-once.mjs",
  "verify-escrow-balance-reconciles-gl.mjs",
  "verify-fleet-table-strict-null-contract.mjs",
  "verify-geofence-carries-samsara-source-id.mjs",
  "verify-glb08-mmm-dd-sweep.mjs",
  "verify-invoices-factored-column.mjs",
  "verify-k5-planner-calendar-mmm-dd.mjs",
  "verify-k6-planner-active-drivers-only.mjs",
  "verify-k7-planner-ranges.mjs",
  "verify-k9-landing-filter-bar.mjs",
  "verify-ldt-4-factoring-money.mjs",
  "verify-lfi11-invoice-search.mjs",
  "verify-liability-balance-syncs-at-settlement-close.mjs",
  "verify-lists-reports-design-law.mjs",
  "verify-load-costs-board-no-truncation-no-wrap.mjs",
  "verify-load-costs-board-tabs.mjs",
  "verify-load-costs-loaded-miles-not-gated-on-basis-type.mjs",
  "verify-load-costs-tab-manifest.mjs",
  "verify-load-costs-tab-registers.mjs",
  "verify-locations-list.mjs",
  "verify-no-duplicate-seed-deductions.mjs",
  "verify-no-future-dated-seed-expenses.mjs",
  "verify-no-geofence-around-unresolved-point.mjs",
  "verify-no-nul-bytes-in-source.mjs",
  "verify-parity-table-header-one-row.mjs",
  "verify-planner-active-drivers-only.mjs",
  "verify-planner-column-lines.mjs",
  "verify-planner-range-options.mjs",
  "verify-planners-list-views.mjs",
  "verify-planners-lists-parity.mjs",
  "verify-quarantine-usmca-wrong-entity-loads.mjs",
  "verify-report-landing-filter-bar.mjs",
  "verify-roundtrips-timeline-restored.mjs",
  "verify-samsara-import-idempotent.mjs",
  "verify-samsara-usmca-retag-migration.mjs",
  "verify-settlement-accrual-and-deadhead.mjs",
  "verify-settlement-detail-kpi-grid.mjs",
  "verify-settlement-detail-readmodel-s1b.mjs",
  "verify-settlement-detail-sections.mjs",
  "verify-settlement-lines-miles-rate-live.mjs",
  "verify-settlement-reversal-voids-settlement-lines.mjs",
  "verify-settlement-seed-cc-3.mjs",
  "verify-settlement-seed-codex.mjs",
  "verify-table-design-contract.mjs",
  "verify-trailer-lists-exclude-interchange.mjs",
  "verify-unit-picker-excludes-archived-deactivated.mjs",
];

// Pure validator so --selftest can plant defects and prove they are rejected.
export function computeProblems({ wired, failing, existsFn }) {
  const problems = [];
  const failingSet = new Set(failing);
  for (const g of wired) {
    if (!existsFn(g)) problems.push(`missing member guard: ${g}`);
    if (failingSet.has(g)) problems.push(`red guard wired (must stay OPEN): ${g}`);
  }
  if (wired.length < 90) problems.push(`wired list shrank to ${wired.length} (<90) — regression`);
  return problems;
}

function realExists(g) {
  return fs.existsSync(path.join(ROOT, "scripts", g));
}

function selftest() {
  // Real list is clean.
  const clean = computeProblems({ wired: WIRED_GUARDS, failing: KNOWN_FAILING, existsFn: realExists });
  if (clean.length) {
    console.error(`${LABEL} SELFTEST FAIL — real wired list is not clean:\n${clean.join("\n")}`);
    process.exit(1);
  }
  // Planted defect 1: a red guard smuggled in must be caught.
  const smuggled = computeProblems({
    wired: [...WIRED_GUARDS, KNOWN_FAILING[0]],
    failing: KNOWN_FAILING,
    existsFn: realExists,
  });
  if (!smuggled.some((p) => p.startsWith("red guard wired"))) {
    console.error(`${LABEL} SELFTEST FAIL — smuggled red guard escaped`);
    process.exit(1);
  }
  // Planted defect 2: a missing member must be caught.
  const missing = computeProblems({
    wired: ["verify-__does_not_exist__.mjs"],
    failing: KNOWN_FAILING,
    existsFn: realExists,
  });
  if (!missing.some((p) => p.startsWith("missing member"))) {
    console.error(`${LABEL} SELFTEST FAIL — missing member escaped`);
    process.exit(1);
  }
  // Planted defect 3: an emptied list must be caught.
  const shrunk = computeProblems({ wired: WIRED_GUARDS.slice(0, 3), failing: KNOWN_FAILING, existsFn: realExists });
  if (!shrunk.some((p) => p.includes("shrank"))) {
    console.error(`${LABEL} SELFTEST FAIL — shrunk list escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${WIRED_GUARDS.length} members present, 0 red wired, 3/3 planted defects rejected`);
}

function runAll() {
  const failures = [];
  for (const g of WIRED_GUARDS) {
    const r = spawnSync("node", [path.join("scripts", g)], {
      cwd: ROOT,
      stdio: "inherit",
      timeout: 120000,
      killSignal: "SIGKILL",
      env: process.env,
    });
    if ((r.status ?? 1) !== 0) failures.push(g);
  }
  if (failures.length) {
    console.error(`${LABEL} FAIL — ${failures.length} member guard(s) failed:\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — ${WIRED_GUARDS.length} orphan guards executed in CI, all green`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else runAll();
}

export default {
  name: LABEL,
  run(ctx) {
    ctx.run("node", [SELF_REL, "--selftest"]);
    for (const g of WIRED_GUARDS) {
      ctx.run("node", ["scripts/" + g]);
    }
  },
};
