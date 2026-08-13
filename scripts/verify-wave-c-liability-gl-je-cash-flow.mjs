#!/usr/bin/env node
/**
 * WAVE-C-liability-gl_je-cash-flow — cash-flow module "Liability" + "GL / JE" columns,
 * VERTICAL-WIRING-LAW-2026-08-12. Leaves: home, tab.daily_prediction, tab.actual_vs_projected.
 *
 * All three already real, never tagged @matrix-built. cash-flow.service.ts's
 * getDailyPrediction (home / tab.daily_prediction) and getActualVsProjected
 * (tab.actual_vs_projected) both aggregate real, already-posted money rows from
 * accounting.bills, accounting.payments, and accounting.bill_payments — the same tables
 * whose journal_entry_id linkage was already verified real in
 * WAVE-C-gl_je-accounting-core-leaves (PR #6235). This is aggregate reporting (SUM by date),
 * not a per-row EntityLink, but the underlying dollars are real posted GL-adjacent
 * transactions, not fabricated projections.
 *
 * tab.manual_daily_projections and create.manual_projection are NOT tagged — their data comes
 * from accounting.cash_flow_adjustments, a real table but explicitly a forecasting-only entry
 * with no journal_entry_id / GL posting (by design: these are manual guesses, not transactions).
 * hop.banking, hop.reports.*, and hop.cash_advances are NOT tagged — each hops to a different
 * module whose own leaf must be independently verified, not inherited from this one.
 * ACCT-F5046: those leaves must NOT Required gl_je (or liability on forecasting-only) in
 * docs/specs/scoreboard/modules/cash-flow.required.json — false Required is scoreboard theater.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["cash-flow"],"cols":["liability","gl_je"],"leafRe":"^(home|tab\\.daily_prediction|tab\\.actual_vs_projected)$","task":"WAVE-C-liability-gl_je-cash-flow","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-liability-gl-je-cash-flow.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-liability-gl-je-cash-flow";

const NO_GL_JE_LEAF_IDS = [
  "tab.manual_daily_projections",
  "create.manual_projection",
  "hop.banking",
  "hop.reports.cash_flow_statement",
  "hop.reports.cash_flow",
  "hop.reports.cash_flow_overview",
  "hop.cash_advances",
];
const NO_LIABILITY_LEAF_IDS = ["tab.manual_daily_projections", "create.manual_projection"];

const CHECKS = [
  {
    name: "cash-flow.service.ts getActualVsProjected sums real accounting.payments",
    file: "apps/backend/src/cash-flow/cash-flow.service.ts",
    pattern: /FROM accounting\.payments p/,
  },
  {
    name: "cash-flow.service.ts getActualVsProjected sums real accounting.bill_payments",
    file: "apps/backend/src/cash-flow/cash-flow.service.ts",
    pattern: /FROM accounting\.bill_payments bp/,
  },
  {
    name: "cash-flow.service.ts (daily prediction path) sums real accounting.bills",
    file: "apps/backend/src/cash-flow/cash-flow.service.ts",
    pattern: /FROM accounting\.bills b/,
  },
  {
    name: "DailyPredictionTab.tsx renders real amount_cents money",
    file: "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx",
    pattern: /amount_cents/,
  },
  {
    name: "ActualVsProjectedTab.tsx wires to the real getActualVsProjected API",
    file: "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx",
    pattern: /getActualVsProjected/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/backend/src/cash-flow/cash-flow.service.ts":
      "FROM accounting.payments p ... FROM accounting.bill_payments bp ... FROM accounting.bills b",
    "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx": "row.amount_cents",
    "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx": "getActualVsProjected(operatingCompanyId, from, to)",
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}

const reqPath = path.join(ROOT, "docs/specs/scoreboard/modules/cash-flow.required.json");
const req = JSON.parse(fs.readFileSync(reqPath, "utf8"));
const honestyFails = [];
for (const leaf of req.leaves || []) {
  const cols = leaf.required || [];
  if (NO_GL_JE_LEAF_IDS.includes(leaf.id) && cols.includes("gl_je")) {
    honestyFails.push(`${leaf.id} must not Required gl_je (ACCT-F5046)`);
  }
  if (NO_LIABILITY_LEAF_IDS.includes(leaf.id) && cols.includes("liability")) {
    honestyFails.push(`${leaf.id} must not Required liability (forecasting-only)`);
  }
}
if (honestyFails.length) {
  console.error(`[${LABEL}] FAILED — required.json honesty:`);
  for (const f of honestyFails) console.error("  ✗", f);
  process.exit(1);
}

console.log(`[${LABEL}] PASS — cash-flow home/daily_prediction/actual_vs_projected liability+gl_je wiring present`);
