#!/usr/bin/env node
/**
 * FIN-S01..S08 — Finance Hub surface ratchet (non-financial UI only).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

export function run() {
  const failures = [];
  const FILES = {
    hub: "apps/frontend/src/pages/finance/FinanceHubPage.tsx",
    overview: "apps/frontend/src/pages/finance/FinanceOverviewPage.tsx",
    arApAging: "apps/frontend/src/pages/finance/ArApAgingPage.tsx",
    loanWizard: "apps/frontend/src/pages/finance/LoanWizardPage.tsx",
    statements: "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx",
    projections: "apps/frontend/src/pages/finance/FinanceProjectionsPage.tsx",
    calculator: "apps/frontend/src/pages/finance/CalculatorPage.tsx",
    amortization: "apps/frontend/src/pages/finance/AmortizationPage.tsx",
    routes: "apps/frontend/src/routes/manifest.tsx",
  };
  for (const [key, p] of Object.entries(FILES)) {
    if (!exists(p)) failures.push(`MISSING: ${p}`);
  }
  if (failures.length) return failures;

  const hub = read(FILES.hub);
  const overview = read(FILES.overview);
  const arAp = read(FILES.arApAging);
  const loan = read(FILES.loanWizard);
  const statements = read(FILES.statements);
  const projections = read(FILES.projections);
  const calculator = read(FILES.calculator);
  const amort = read(FILES.amortization);
  const routes = read(FILES.routes);

  if (!/FINANCE_HUB_UI_FLAG/.test(hub)) failures.push("FinanceHubPage: must reference FINANCE_HUB_UI_FLAG");
  if (!/Finance Hub is not enabled for this entity/.test(hub)) failures.push("FinanceHubPage: missing disabled gate message");
  if (!/getFinanceHubOverview\s*\(/.test(hub)) failures.push("FinanceHubPage: must fetch finance hub overview");
  if (!/operating_company_id:\s*companyId/.test(hub)) failures.push("FinanceHubPage: must pass operating_company_id");
  if (!/overviewQuery\.isError[\s\S]*?<ListErrorState[\s\S]*?overviewQuery\.refetch\(\)/.test(hub)) {
    failures.push("FinanceHubPage: overview query failures must render a retryable ListErrorState");
  }

  if (!/future module|not yet built|placeholder/i.test(overview)) failures.push("FinanceOverviewPage: must label itself as a future/placeholder module");

  if (!/AR_AP_AGING_UI_FLAG/.test(arAp)) failures.push("ArApAgingPage: must reference AR_AP_AGING_UI_FLAG");
  if (!/AR \/ AP aging is not yet enabled/.test(arAp) && !/AR_AP_AGING_UI_ENABLED feature flag/.test(arAp)) {
    failures.push("ArApAgingPage: must name the feature flag when disabled");
  }
  if (!/getArAging\s*\(/.test(arAp) || !/getApAging\s*\(/.test(arAp)) {
    failures.push("ArApAgingPage: must call both getArAging and getApAging");
  }

  if (!/FINANCE_HUB_LOAN_WIZARD_FLAG/.test(loan)) failures.push("LoanWizardPage: must reference FINANCE_HUB_LOAN_WIZARD_FLAG");
  if (!/previewLoanWizard\s*\(/.test(loan)) failures.push("LoanWizardPage: must call previewLoanWizard");
  if (!/preview only|Nothing posts|posting.*separate|not enabled here/i.test(loan)) {
    failures.push("LoanWizardPage: must state it is preview-only and does not post");
  }

  if (!/not yet built|future module|placeholder/i.test(projections)) failures.push("FinanceProjectionsPage: must be an honest placeholder");

  if (!/FINANCE_STATEMENTS_UI_FLAG/.test(statements)) failures.push("FinancialStatementsPage: must reference FINANCE_STATEMENTS_UI_FLAG");
  if (!/Profit & loss|Balance sheet|Trial balance/.test(statements)) failures.push("FinancialStatementsPage: must render P&L / Balance Sheet / Trial Balance tabs");
  if (!/Financial statements are not yet enabled/.test(statements)) failures.push("FinancialStatementsPage: missing disabled gate message");
  if (!/getProfitLossReport\s*\(/.test(statements) || !/getBalanceSheetReport\s*\(/.test(statements) || !/getTrialBalanceReport\s*\(/.test(statements)) {
    failures.push("FinancialStatementsPage: must call all three report APIs");
  }

  if (!/FINANCE_HUB_CALCULATOR_FLAG/.test(calculator)) failures.push("CalculatorPage: must reference FINANCE_HUB_CALCULATOR_FLAG");
  if (!/FINANCE_HUB_AMORTIZATION_FLAG/.test(amort)) failures.push("AmortizationPage: must reference FINANCE_HUB_AMORTIZATION_FLAG");
  if (!/computeCalculator\s*\(/.test(calculator)) failures.push("CalculatorPage: must call computeCalculator");
  if (!/createLoan\s*\(/.test(amort)) failures.push("AmortizationPage: must call createLoan");
  if (!/path="\/finance\/calculator"/.test(routes)) failures.push("routes: missing /finance/calculator route");
  if (!/path="\/finance\/amortization"/.test(routes)) failures.push("routes: missing /finance/amortization route");

  return failures;
}

function selftest() {
  const realPath = path.join(ROOT, "apps/frontend/src/pages/finance/FinanceProjectionsPage.tsx");
  const backup = fs.readFileSync(realPath, "utf8");
  try {
    fs.writeFileSync(realPath, backup.replace(/not yet built|future module|placeholder/gi, "working forecasting module"), "utf8");
    const planted = run();
    if (planted.length === 0) {
      console.error("[verify-finance-hub-surfaces-s01-s08] SELFTEST FAIL: planted placeholder removal did not fail");
      process.exit(1);
    }
    console.log(`[verify-finance-hub-surfaces-s01-s08] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(realPath, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  const failures = run();
  if (failures.length > 0) {
    console.error("\n[verify-finance-hub-surfaces-s01-s08] FAILED:\n");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("[verify-finance-hub-surfaces-s01-s08] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
