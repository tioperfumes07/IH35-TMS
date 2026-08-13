#!/usr/bin/env node
/**
 * WAVE-C-gl_je-cashflow-reports — gl_je column, VERTICAL-WIRING-LAW-2026-08-12.
 * Leaves: finance.nav.break_even, reports.report.cash_flow_statement, reports.report.cash_flow,
 * reports.report.cash_flow_overview.
 *
 * All four already real, never tagged @matrix-built:
 *   - finance.nav.break_even (BreakEvenPage.tsx): gl_revenue_cents comes from
 *     break-even.service.ts's `pnl.revenue.total` — the SAME real profit-loss.service.ts
 *     already verified to directly JOIN accounting.journal_entries in
 *     WAVE-C-liability-gl_je-finance-statements (PR #6255).
 *   - reports.report.cash_flow_statement (CashFlowStatementPage.tsx ->
 *     /api/v1/accounting/cash-flow -> cash-flow.service.ts): directly joins
 *     accounting.journal_entry_postings / accounting.journal_entries (ASC 230 statement of
 *     cash flows).
 *   - reports.report.cash_flow (CashFlowReport.tsx -> /api/v1/reports/cash-flow ->
 *     route-fix.ts): its own comment says "Delegates to the same query stack as
 *     cash-flow-overview" — real accounting.invoices/accounting.bills.
 *   - reports.report.cash_flow_overview (CashFlowOverviewPage.tsx ->
 *     cash-flow-overview.routes.ts): FROM accounting.invoices / FROM accounting.bills.
 *
 * finance.nav.calculator (CalculatorPage.tsx) and finance.nav.projections/nav.scenarios are
 * NOT tagged — the calculator is a standalone loan-amortization planning tool with no posted
 * GL transaction (same non-posting shape already excluded for nav.amortization, PR #6275);
 * FinanceProjectionsPage.tsx and FinanceScenariosPage.tsx are both explicit, self-documented
 * placeholders ("not yet built — this is a future module placeholder" /
 * "There is no working feature behind this tab today").
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["finance"],"cols":["gl_je"],"leafRe":"^nav\\.break_even$","task":"WAVE-C-gl_je-finance-break-even","vertical":"column-wave"}
 * @matrix-built {"modules":["reports"],"cols":["gl_je"],"leafRe":"^(report\\.cash_flow_statement|report\\.cash_flow|report\\.cash_flow_overview)$","task":"WAVE-C-gl_je-reports-cashflow","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-cashflow-reports.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-cashflow-reports";

const CHECKS = [
  {
    name: "break-even.service.ts sources gl_revenue_cents from the real P&L",
    file: "apps/backend/src/accounting/break-even.service.ts",
    pattern: /gl_revenue_cents: pnl\.revenue\.total/,
  },
  {
    name: "cash-flow.service.ts joins real accounting.journal_entries (ASC 230)",
    file: "apps/backend/src/accounting/cash-flow.service.ts",
    pattern: /JOIN accounting\.journal_entries je/,
  },
  {
    name: "reports/cash-flow route-fix delegates to the real cash-flow-overview query stack",
    file: "apps/backend/src/reports/cash-flow/route-fix.ts",
    pattern: /Delegates to the same query stack as/,
  },
  {
    name: "cash-flow-overview.routes.ts sources real accounting.invoices",
    file: "apps/backend/src/reports/cash-flow-overview.routes.ts",
    pattern: /FROM accounting\.invoices i/,
  },
  {
    name: "cash-flow-overview.routes.ts sources real accounting.bills",
    file: "apps/backend/src/reports/cash-flow-overview.routes.ts",
    pattern: /FROM accounting\.bills b/,
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
    "apps/backend/src/accounting/break-even.service.ts": "gl_revenue_cents: pnl.revenue.total,",
    "apps/backend/src/accounting/cash-flow.service.ts": "JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid",
    "apps/backend/src/reports/cash-flow/route-fix.ts": "Delegates to the same query stack as cash-flow-overview",
    "apps/backend/src/reports/cash-flow-overview.routes.ts":
      "FROM accounting.invoices i JOIN ... FROM accounting.bills b JOIN ...",
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
console.log(`[${LABEL}] PASS — finance break_even + reports cash_flow_statement/cash_flow/cash_flow_overview gl_je wiring present`);
