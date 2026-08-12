#!/usr/bin/env node
/**
 * factoring "liability" (Liability / Reserve) COLUMN — VERTICAL-WIRING-LAW-2026-08-12.
 *
 * @matrix-built {"modules":["factoring"],"cols":["liability"],"leafRe":"^(factors\\.admin|home\\.equipment_loans)$","task":"WAVE-C-liability-factoring","vertical":"column-wave"}
 *
 * Audited factoring's "Liability / Reserve" column across all 19 required leaves. Root finding: a
 * live phantom-column bug in a presentation-view family (views.factoring_summary + 3 siblings, all
 * currently live) silently shows $0.00 for real, live TRANSP factoring activity — the fix already
 * exists, reviewed, but is registered [HOLD-FOR-JORGE — TIER 1 FINANCIAL] (migration
 * 202609100100_fact_phantom_01_fact_01_factoring_summary_linkage.sql) and is deliberately NOT
 * applied by this guard/commit — that decision requires the owner, not an autonomous session. See
 * db/migrations/.held-migrations.json for the full chain and reasoning.
 *
 * Two smaller, real, NON-held-gated gaps were found and fixed here:
 *   - factors.admin (FactorAdmin.tsx): showed only contract-term percentages, never the outstanding
 *     $ reserve/liability balance per factor. Fixed by joining the real, live
 *     factoring.v_factor_reserve_balance ledger (the same source reserves.dashboard already uses)
 *     into listFactors().
 *   - home.equipment_loans (FactoringHome.tsx): showed only the static origination principal,
 *     never a computed outstanding balance. Fixed by computing
 *     principal_cents - SUM(payments.principal_cents) server-side in listEquipmentLoans().
 *
 * REMAINING (documented, not silently dropped): batches.create never computes an
 * expected_reserve_cents at all (calculateBatchTotals has no reserveRate parameter, and
 * factoring_batches has no such column) — a real gap requiring a new migration + call-site changes,
 * out of scope for this pass. The 6 leaves gated by the HELD phantom-view fix (home.summary,
 * home.recourse_pipeline, home.chargebacks_fees, home.statements_settings, dispatch.queue,
 * banking.entry) remain exactly as they were — awaiting the owner's application of the queued fix.
 *
 * Self-test: node scripts/verify-factoring-liability-reserve-column.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-liability-reserve-column";

const CHECKS = [
  {
    name: "factors.admin: listFactors() joins the real reserve-balance ledger",
    file: "apps/backend/src/factoring/factor.service.ts",
    pattern: /LEFT JOIN factoring\.v_factor_reserve_balance rb/,
  },
  {
    name: "factors.admin: FactorAdmin.tsx renders the reserve balance column",
    file: "apps/frontend/src/pages/factoring/FactorAdmin.tsx",
    pattern: /reserve_balance_cents/,
  },
  {
    name: "home.equipment_loans: listEquipmentLoans() computes outstanding_balance_cents",
    file: "apps/backend/src/data-infra/data-infra.service.ts",
    pattern: /outstanding_balance_cents/,
  },
  {
    name: "home.equipment_loans: FactoringHome.tsx renders the outstanding balance",
    file: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    pattern: /row\.outstanding_balance_cents/,
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
    "apps/backend/src/factoring/factor.service.ts": "LEFT JOIN factoring.v_factor_reserve_balance rb ON true",
    "apps/frontend/src/pages/factoring/FactorAdmin.tsx": "factor.reserve_balance_cents",
    "apps/backend/src/data-infra/data-infra.service.ts": "AS outstanding_balance_cents",
    "apps/frontend/src/pages/factoring/FactoringHome.tsx": "row.outstanding_balance_cents",
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
console.log(`[${LABEL}] PASS — factors.admin + home.equipment_loans reserve/liability balance fixes present`);
