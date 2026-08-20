#!/usr/bin/env node
/**
 * WAVE 1 drivers money — Box 3 Built for `cash_advances` × `liability`.
 *
 * @matrix-built {"modules":["drivers"],"cols":["liability"],"task":"WAVE1-DRIVERS-CASH-ADVANCES-LIABILITY-BUILT","vertical":"column-wave","leafRe":"^cash_advances$"}
 *
 * /drivers/cash-advances (CashAdvancesHome.tsx) already renders a real, per-row liability balance:
 * CashAdvancesTable.tsx's "Outstanding" column and CashAdvancesKpiRow.tsx's total_outstanding KPI
 * both derive from `l.current_balance` (0046_p3_t11_11_cash_advance.sql's outstanding_balance CTE
 * column, the loan/liability ledger's own running balance) — not a static/derived display, the real
 * liability figure, per-driver and totaled. The wiring existed, only the Box-3 credit was missing.
 *
 * Self-test: node scripts/verify-driver-cash-advances-liability-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-cash-advances-liability-wired";

const CHECKS = [
  {
    name: "CashAdvancesTable renders an Outstanding (liability balance) column per row",
    file: "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx",
    pattern: /key:\s*"outstanding_balance"[\s\S]{0,120}render:\s*\(row\)\s*=>[\s\S]{0,60}row\.outstanding_balance/,
  },
  {
    name: "CashAdvancesKpiRow totals outstanding liability across the board",
    file: "apps/frontend/src/pages/cash-advances/components/CashAdvancesKpiRow.tsx",
    pattern: /amount\(kpis,\s*"total_outstanding"\)/,
  },
  {
    name: "outstanding_balance is sourced from the liability ledger's own running balance (current_balance), not a derived/static figure",
    file: "db/migrations/202612750000_cash_advances_with_context_load_link.sql",
    pattern: /l\.current_balance::numeric\s+AS\s+outstanding_balance/,
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
    "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx": `
      {
        key: "outstanding_balance",
        label: "Outstanding",
        render: (row) => \`$\${Number(row.outstanding_balance ?? 0).toFixed(2)}\`,
      },
    `,
    "apps/frontend/src/pages/cash-advances/components/CashAdvancesKpiRow.tsx": `
      value={money(amount(kpis, "total_outstanding"))}
    `,
    "db/migrations/202612750000_cash_advances_with_context_load_link.sql": `
        l.current_balance::numeric AS outstanding_balance,
    `,
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
console.log(`[${LABEL}] PASS — cash advances outstanding-liability display + KPI + ledger-sourced balance all present`);
