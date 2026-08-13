#!/usr/bin/env node
/**
 * WAVE-C-gl_je-finance-hop — finance module "GL / JE" column, VERTICAL-WIRING-LAW-2026-08-12.
 * Leaves: hub, hub.alias, nav.ar_ap_aging, nav.loan_wizard, hop.accounting, hop.cash_flow,
 * hop.reports.
 *
 * All seven already real, never tagged @matrix-built:
 *   - hub / hub.alias (FinanceHubPage.tsx, /finance + /finance-hub): KPIs source
 *     views.ar_aging / views.ap_aging, both real (FROM accounting.bills / accounting.invoices,
 *     confirmed in db/migrations/0242_drift_reconciliation.sql).
 *   - nav.ar_ap_aging (ArApAgingPage.tsx, /finance/ar-ap-aging): wires
 *     /api/v1/accounting/fin20/ar-aging + ap-aging, backed by fin20-aging.service.ts's
 *     accounting.ar_aging_as_of()/accounting.ap_aging_as_of() functions plus direct
 *     accounting.invoices/accounting.bills drill-through joins.
 *   - nav.loan_wizard (LoanWizardPage.tsx, /finance/loan-wizard): renders a real
 *     opening_journal_entry preview with debit/credit lines before creating the loan.
 *   - hop.accounting (AccountingHubPage.tsx, /accounting): aggregates real
 *     accounting.bills/accounting.invoices amount_cents/amount_open_cents.
 *   - hop.cash_flow / hop.reports: hop to /cash-flow and /reports/profit-loss, both already
 *     verified real in WAVE-C-liability-gl_je-cash-flow (PR #6252) and
 *     WAVE-C-liability-gl_je-finance-statements (PR #6255) respectively.
 *
 * nav.overview is NOT tagged — FinanceOverviewPage.tsx is an explicit placeholder ("Future
 * module for financial planning", no data query at all). nav.amortization is NOT tagged —
 * AmortizationPage.tsx explicitly states "Schedules are stored; posting is a separate step"
 * (pre-posting projection, same shape as cash-flow's manual_daily_projections exclusion).
 * nav.projections/nav.scenarios/nav.break_even/nav.calculator not independently verified this
 * pass — real remaining gap, not over-claimed.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["finance"],"cols":["gl_je"],"leafRe":"^(hub|hub\\.alias|nav\\.ar_ap_aging|nav\\.loan_wizard|hop\\.accounting|hop\\.cash_flow|hop\\.reports)$","task":"WAVE-C-gl_je-finance-hop","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-finance-hop.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-finance-hop";

const CHECKS = [
  {
    name: "finance-hub.service.ts sources real views.ar_aging",
    file: "apps/backend/src/accounting/finance-hub.service.ts",
    pattern: /FROM views\.ar_aging/,
  },
  {
    name: "views.ap_aging is backed by real accounting.bills",
    file: "db/migrations/0242_drift_reconciliation.sql",
    pattern: /CREATE OR REPLACE VIEW views\.ap_aging[\s\S]*FROM accounting\.bills b/,
  },
  {
    name: "fin20-aging.service.ts computes real accounting.ar_aging_as_of",
    file: "apps/backend/src/accounting/fin20-aging.service.ts",
    pattern: /FROM accounting\.ar_aging_as_of/,
  },
  {
    name: "ArApAgingPage.tsx wires the real fin20 aging APIs",
    file: "apps/frontend/src/pages/finance/ArApAgingPage.tsx",
    pattern: /getArAging[\s\S]*getApAging/,
  },
  {
    name: "LoanWizardPage.tsx renders a real opening_journal_entry preview",
    file: "apps/frontend/src/pages/finance/LoanWizardPage.tsx",
    pattern: /preview\.opening_journal_entry/,
  },
  {
    name: "AccountingHubPage.tsx aggregates real accounting.bills/invoices cents",
    file: "apps/frontend/src/pages/accounting/AccountingHubPage.tsx",
    pattern: /amount_open_cents/,
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
    "apps/backend/src/accounting/finance-hub.service.ts": "FROM views.ar_aging",
    "db/migrations/0242_drift_reconciliation.sql":
      "CREATE OR REPLACE VIEW views.ap_aging WITH (security_invoker = true) AS WITH open_bills AS ( SELECT ... FROM accounting.bills b",
    "apps/backend/src/accounting/fin20-aging.service.ts": "FROM accounting.ar_aging_as_of($1::uuid, $2::date)",
    "apps/frontend/src/pages/finance/ArApAgingPage.tsx": "getArAging, getApAging",
    "apps/frontend/src/pages/finance/LoanWizardPage.tsx": "preview.opening_journal_entry.lines",
    "apps/frontend/src/pages/accounting/AccountingHubPage.tsx": "invoice.amount_open_cents",
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
console.log(`[${LABEL}] PASS — finance hub/hub.alias/nav.ar_ap_aging/nav.loan_wizard/hop.* gl_je wiring present`);
