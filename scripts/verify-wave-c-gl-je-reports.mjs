#!/usr/bin/env node
/**
 * WAVE-C-gl_je-reports — reports module "GL / JE" (+ liability on settlement_summary) column,
 * VERTICAL-WIRING-LAW-2026-08-12. Leaves already real, never tagged @matrix-built:
 *   - report.ar_aging / report.ap_aging: ARAgingPage.tsx / APAgingPage.tsx wire
 *     getArAgingReport / getApAgingReport, backed by ar-aging.service.ts (FROM
 *     accounting.invoices) and ap-aging.service.ts (FROM accounting.bills /
 *     accounting.bill_payments) — the same tables already verified to carry
 *     journal_entry_id.
 *   - report.trial_balance / report.profit_loss / report.balance_sheet: the SAME
 *     trial-balance/profit-loss/balance-sheet.service.ts already verified in
 *     WAVE-C-liability-gl_je-finance-statements (PR #6255) — direct JOIN
 *     accounting.journal_entries.
 *   - audit.financial_change_log / audit.void_reversal / audit.deduction_trail /
 *     audit.period_close_history: audit-reports.routes.ts filters the real WORM audit log
 *     (events.event_log + audit.audit_events) by GL-specific event_type patterns
 *     ('%journal%'/'%post%'/'%revers%' for financial-change-log; '%void%'/'%revers%'/
 *     '%cancel%' for void-reversal; '%deduction%'/'%fine%'/'%chargeback%' for
 *     deduction-trail; '%period%close%' for period-close-history) — not a generic
 *     activity feed, specifically GL-affecting events.
 *   - report.settlement_summary (liability only): SettlementSummaryPage.tsx renders real
 *     gross_pay_cents/deduction_cents/chargeback_cents/net_pay_cents from
 *     getSettlementSummary. gl_je NOT tagged for this leaf — no direct journal_entry link
 *     confirmed.
 *
 * audit.activity_by_user / audit.activity_by_module / audit.maintenance_decision_log are NOT
 * tagged — those event_log queries are generic (no GL-specific event_type filter), so gl_je
 * was not independently confirmed. report.cash_flow_statement/cash_flow/cash_flow_overview/
 * per_truck_cpm/customer_profitability/profit_per_truck/runner.cash_position are also not
 * tagged — their backend source was not located in this pass. Real remaining gap, not
 * over-claimed.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["reports"],"cols":["gl_je"],"leafRe":"^(report\\.ar_aging|report\\.ap_aging|report\\.trial_balance|report\\.profit_loss|report\\.balance_sheet|report\\.management|audit\\.financial_change_log|audit\\.void_reversal|audit\\.deduction_trail|audit\\.period_close_history)$","task":"WAVE-C-gl_je-reports","vertical":"column-wave"}
 * @matrix-built {"modules":["reports"],"cols":["liability"],"leafRe":"^report\\.settlement_summary$","task":"WAVE-C-liability-reports-settlement-summary","vertical":"column-wave"}
 * @matrix-built {"modules":["reports"],"cols":["settlement"],"leafRe":"^(report\\.settlement_summary|runner\\.driver_pay_history|runner\\.driver_settlement)$","task":"WAVE-C-settlement-reports","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-reports.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-reports";

const CHECKS = [
  {
    name: "ar-aging.service.ts sources real accounting.invoices",
    file: "apps/backend/src/accounting/ar-aging.service.ts",
    pattern: /FROM accounting\.invoices i/,
  },
  {
    name: "ap-aging.service.ts sources real accounting.bills",
    file: "apps/backend/src/accounting/ap-aging.service.ts",
    pattern: /FROM accounting\.bills b/,
  },
  {
    name: "ARAgingPage.tsx wires the real getArAgingReport API",
    file: "apps/frontend/src/pages/reports/ARAgingPage.tsx",
    pattern: /getArAgingReport/,
  },
  {
    name: "APAgingPage.tsx wires the real getApAgingReport API",
    file: "apps/frontend/src/pages/reports/APAgingPage.tsx",
    pattern: /getApAgingReport/,
  },
  {
    name: "reports pages wire the real trial-balance/profit-loss/balance-sheet APIs",
    file: "apps/frontend/src/pages/reports/TrialBalancePage.tsx",
    pattern: /getTrialBalanceReport/,
  },
  {
    name: "audit-reports.routes.ts financial-change-log filters GL-specific event types",
    file: "apps/backend/src/audit/audit-reports.routes.ts",
    pattern: /financial-change-log[\s\S]*journal/,
  },
  {
    name: "audit-reports.routes.ts void-reversal reads the real WORM audit sinks",
    file: "apps/backend/src/audit/audit-reports.routes.ts",
    pattern: /FROM events\.event_log el[\s\S]*FROM audit\.audit_events ae/,
  },
  {
    name: "audit-reports.routes.ts deduction-trail filters deduction/chargeback event types",
    file: "apps/backend/src/audit/audit-reports.routes.ts",
    pattern: /deduction-trail[\s\S]*chargeback/,
  },
  {
    name: "audit-reports.routes.ts period-close-history filters period-close event types",
    file: "apps/backend/src/audit/audit-reports.routes.ts",
    pattern: /period-close-history[\s\S]*period%close/,
  },
  {
    name: "SettlementSummaryPage.tsx renders real settlement liability figures",
    file: "apps/frontend/src/pages/reports/SettlementSummaryPage.tsx",
    pattern: /deduction_cents/,
  },
  {
    name: "ManagementReportPackagePage.tsx wires real P&L + Balance Sheet APIs",
    file: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
    pattern: /getProfitLossReport[\s\S]*getBalanceSheetReport/,
  },
  {
    name: "runner-config.ts driver-pay-history hits driver settlements API",
    file: "apps/frontend/src/pages/reports/runners/runner-config.ts",
    pattern: /"driver-pay-history"[\s\S]*\/api\/v1\/reports\/driver-pay-history/,
  },
  {
    name: "runner-config.ts driver-settlement hits driver-settlement-summary API",
    file: "apps/frontend/src/pages/reports/runners/runner-config.ts",
    pattern: /"driver-settlement"[\s\S]*\/api\/v1\/reports\/driver-settlement-summary/,
  },
  {
    name: "driver-pay-history.routes.ts sources driver_finance.driver_settlements",
    file: "apps/backend/src/reports/driver-pay-history.routes.ts",
    pattern: /driver_finance\.driver_settlements/,
  },
  {
    name: "driver-settlement-summary.routes.ts sources driver_finance.driver_settlements",
    file: "apps/backend/src/reports/driver-settlement-summary.routes.ts",
    pattern: /driver_finance\.driver_settlements/,
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
    "apps/backend/src/accounting/ar-aging.service.ts": "FROM accounting.invoices i JOIN ...",
    "apps/backend/src/accounting/ap-aging.service.ts": "FROM accounting.bills b JOIN ...",
    "apps/frontend/src/pages/reports/ARAgingPage.tsx": "getArAgingReport(companyId, asOf)",
    "apps/frontend/src/pages/reports/APAgingPage.tsx": "getApAgingReport(companyId, asOf)",
    "apps/frontend/src/pages/reports/TrialBalancePage.tsx": "getTrialBalanceReport(...)",
    "apps/backend/src/audit/audit-reports.routes.ts":
      "app.get(\"/api/v1/audit/reports/financial-change-log\" ... '%journal%' ... FROM events.event_log el ... FROM audit.audit_events ae ... \"/api/v1/audit/reports/deduction-trail\" ... chargeback ... \"/api/v1/audit/reports/period-close-history\" ... period%close",
    "apps/frontend/src/pages/reports/SettlementSummaryPage.tsx": "r.deduction_cents",
    "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx":
      "getProfitLossReport(...)\ngetBalanceSheetReport(...)",
    "apps/frontend/src/pages/reports/runners/runner-config.ts":
      '"driver-pay-history": { apiPath: "/api/v1/reports/driver-pay-history" }\n"driver-settlement": { apiPath: "/api/v1/reports/driver-settlement-summary" }',
    "apps/backend/src/reports/driver-pay-history.routes.ts": "FROM driver_finance.driver_settlements s",
    "apps/backend/src/reports/driver-settlement-summary.routes.ts": "FROM driver_finance.driver_settlements s",
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
console.log(`[${LABEL}] PASS — reports ar/ap aging + trial-balance/pl/bs + audit GL-filtered logs + settlement_summary wiring present`);
