#!/usr/bin/env node
/**
 * settlements ap_bill + gl_je (settlements.detail leaf) — VERTICAL-WIRING-LAW-2026-08-12.
 *
 * @matrix-built {"modules":["settlements"],"cols":["ap_bill","gl_je"],"leafRe":"^settlements\\.detail$","task":"WAVE-C-settlements-gl-bills-drillthrough","vertical":"column-wave"}
 *
 * The ap_bill audit (PR #6175, this session) confirmed settlement-bill-payment-posting.service.ts
 * genuinely creates a real accounting.bills row + journal entry per load a settlement pays out
 * (flag SETTLEMENT_GL_POSTING_ENABLED, live for all 3 entities since 2026-07-26), tracked in
 * driver_finance.driver_settlement_gl_bills (accounting_bill_id, bill_journal_entry_id) — but
 * documented it as REMAINING: zero UI surface anywhere, larger scope than a reverse-JOIN. On
 * re-investigation the "larger scope" turned out to be exactly one new SELECT (the linking table
 * already existed, already populated) plus one new render section — not a schema change.
 *
 * Self-test: node scripts/verify-settlements-gl-bills-drillthrough.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-gl-bills-drillthrough";

const CHECKS = [
  {
    name: "backend: settlement detail selects driver_settlement_gl_bills",
    file: "apps/backend/src/driver-finance/settlements.routes.ts",
    pattern: /FROM driver_finance\.driver_settlement_gl_bills/,
  },
  {
    name: "frontend: SettlementDetailPage renders the GL-Posted Bills section",
    file: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
    pattern: /settlement-linked-bills/,
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
    "apps/backend/src/driver-finance/settlements.routes.ts": "SELECT accounting_bill_id::text\n FROM driver_finance.driver_settlement_gl_bills\n WHERE settlement_id = $1",
    "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx": 'data-testid="settlement-linked-bills"',
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
console.log(`[${LABEL}] PASS — settlement detail exposes + renders the real GL-posted bill/JE drill-through`);
