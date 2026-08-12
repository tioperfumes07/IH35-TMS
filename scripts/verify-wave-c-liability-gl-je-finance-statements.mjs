#!/usr/bin/env node
/**
 * WAVE-C-liability-gl_je-finance-statements — finance module "Liability" + "GL / JE" columns,
 * VERTICAL-WIRING-LAW-2026-08-12. Leaves: nav.statements, statements.pl, statements.bs,
 * statements.tb — all four are the SAME page (FinancialStatementsPage.tsx at
 * /finance/statements), already real, never tagged @matrix-built.
 *
 * This is the strongest possible basis: trial-balance.service.ts, profit-loss.service.ts, and
 * balance-sheet.service.ts each directly `JOIN accounting.journal_entries je` — a P&L/BS/TB IS
 * the GL, not merely GL-adjacent. balance-sheet.service.ts computes an explicit `liabilities`
 * section (BalanceSheetSection with lines + total, `total_liabilities_and_equity`). Read-only
 * reports; no new GL math, no posting.
 *
 * finance's other liability/gl_je leaves (hub, hub.alias, nav.overview, nav.ar_ap_aging,
 * nav.projections, nav.scenarios, nav.break_even, nav.calculator, nav.amortization,
 * nav.loan_wizard, hop.*) are NOT tagged here — finance-hub.service.ts sources KPIs from
 * views.ar_aging / views.ap_aging / accounting.fixed_assets (real, AP aging is a genuine
 * liability concept) but never directly joins accounting.journal_entries, so gl_je was not
 * independently confirmed for the hub; left as real remaining gap, not over-claimed.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["finance"],"cols":["liability","gl_je"],"leafRe":"^(nav\\.statements|statements\\.pl|statements\\.bs|statements\\.tb)$","task":"WAVE-C-liability-gl_je-finance-statements","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-liability-gl-je-finance-statements.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-liability-gl-je-finance-statements";

const CHECKS = [
  {
    name: "trial-balance.service.ts joins real accounting.journal_entries",
    file: "apps/backend/src/accounting/trial-balance.service.ts",
    pattern: /JOIN accounting\.journal_entries je/,
  },
  {
    name: "profit-loss.service.ts joins real accounting.journal_entries",
    file: "apps/backend/src/accounting/profit-loss.service.ts",
    pattern: /JOIN accounting\.journal_entries je/,
  },
  {
    name: "balance-sheet.service.ts joins real accounting.journal_entries",
    file: "apps/backend/src/accounting/balance-sheet.service.ts",
    pattern: /JOIN accounting\.journal_entries je/,
  },
  {
    name: "balance-sheet.service.ts computes a real liabilities section",
    file: "apps/backend/src/accounting/balance-sheet.service.ts",
    pattern: /total_liabilities_and_equity/,
  },
  {
    name: "FinancialStatementsPage.tsx wires all three real report APIs",
    file: "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx",
    pattern: /getProfitLossReport[\s\S]*getBalanceSheetReport[\s\S]*getTrialBalanceReport/,
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
    "apps/backend/src/accounting/trial-balance.service.ts": "JOIN accounting.journal_entries je ON ...",
    "apps/backend/src/accounting/profit-loss.service.ts": "JOIN accounting.journal_entries je ON ...",
    "apps/backend/src/accounting/balance-sheet.service.ts":
      "JOIN accounting.journal_entries je ON ... total_liabilities_and_equity: totalLiabilitiesAndEquity,",
    "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx":
      "getProfitLossReport, getBalanceSheetReport, getTrialBalanceReport",
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
console.log(`[${LABEL}] PASS — finance nav.statements/statements.pl/bs/tb liability+gl_je wiring present`);
