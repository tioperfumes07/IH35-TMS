#!/usr/bin/env node
/**
 * CLOSURE-16-DEEP-AUDIT-C — 11 canonical reports CI guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "deep-audit-c-reports";

const CANONICAL_REPORTS = [
  { path: "/reports/balance-sheet", page: "BalanceSheetPage", audit: "Balance Sheet" },
  { path: "/reports/trial-balance", page: "TrialBalancePage", audit: "Trial Balance" },
  { path: "/reports/profit-loss", page: "ProfitLossPage", audit: "Profit & Loss" },
  { path: "/reports/cash-flow-statement", page: "CashFlowStatementPage", audit: "Cash Flow Statement" },
  { path: "/reports/settlement-summary", page: "SettlementSummaryPage", audit: "Settlement Summary" },
  { path: "/reports/customer-profitability", page: "CustomerProfitabilityPage", audit: "Customer Profitability" },
  { path: "/reports/per-truck-cpm", page: "PerTruckCpmReport", audit: "Per-Truck CPM" },
  { path: "/reports/fuel-reconciliation", page: "FuelReconciliationPage", audit: "Fuel Reconciliation" },
  { path: "/reports/ar-aging", page: "ARAgingPage", audit: "AR Aging" },
  { path: "/reports/ap-aging", page: "APAgingPage", audit: "AP Aging" },
  // #8462 LV-REPORTS-IFTA-RUNNER-DUPLICATE-POLICY-CHROME: the canonical IFTA mount is /reports/ifta-preparer (IftaPreparer);
  // the legacy /reports/ifta path is a Navigate alias to it (checked below) — "no dual IFTAPreparer mount".
  { path: "/reports/ifta-preparer", page: "IftaPreparer", audit: "IFTA Quarterly" },
];

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const manifest = read("apps/frontend/src/routes/manifest.tsx");
const audit = read("docs/audits/DEEP-AUDIT-C-CANONICAL-REPORTS.md");
const summary = read("docs/audits/DEEP-AUDIT-C-SUMMARY.md");

for (const report of CANONICAL_REPORTS) {
  if (!manifest.includes(`path="${report.path}"`)) {
    fail(`route manifest missing ${report.path}`);
  }
  if (!manifest.includes(report.page)) {
    fail(`route manifest must import ${report.page} for ${report.path}`);
  }
  if (!audit.includes(report.audit)) {
    fail(`audit doc missing section for ${report.audit}`);
  }
}

if (!/path="\/reports\/ifta"[\s\S]{0,400}<Navigate to="\/reports\/ifta-preparer" replace \/>/.test(manifest)) {
  fail("legacy /reports/ifta must still redirect to /reports/ifta-preparer (#8462)");
}

for (const section of ["CRITICAL", "HIGH", "11 canonical"]) {
  if (!summary.includes(section)) {
    fail(`summary missing required section: ${section}`);
  }
}

console.log(`[${LABEL}] PASS — ${CANONICAL_REPORTS.length} canonical reports verified`);
