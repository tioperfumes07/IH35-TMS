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

/**
 * A surface satisfies the "honest about its own build state" invariant either by explicitly
 * self-labeling as a placeholder (the original, still-valid form for a surface that truly has no
 * real functionality yet), OR by being genuinely built: a real feature-flag reference, an honest
 * disabled-state message naming that flag when it's off, and at least one real data-fetching API
 * call. The second form is not a weaker substitute — it is graduation from placeholder to real,
 * still-honest UI (FinanceOverviewPage/FinanceProjectionsPage both moved from the former to the
 * latter once financeScenarios shipped; requiring literal placeholder language on a page that
 * genuinely fetches and renders live data would itself be a false, theater-shaped claim).
 */
function isHonestlyBuiltOrPlaceholder(src, apiCallPatterns) {
  if (/future module|not yet built|placeholder/i.test(src)) return true;
  const hasFlag = /FINANCE_HUB_SCENARIOS_FLAG/.test(src);
  const hasDisabledMessage = /\b(?:is|are) not yet enabled for this company/i.test(src);
  const hasApiCalls = apiCallPatterns.every((re) => re.test(src));
  return hasFlag && hasDisabledMessage && hasApiCalls;
}

/** @param {Record<string, string>} overrides in-memory file-content overrides, keyed like FILES */
export function run(overrides = {}) {
  const failures = [];
  for (const [key, p] of Object.entries(FILES)) {
    if (!(key in overrides) && !exists(p)) failures.push(`MISSING: ${p}`);
  }
  if (failures.length) return failures;

  const hub = overrides.hub ?? read(FILES.hub);
  const overview = overrides.overview ?? read(FILES.overview);
  const arAp = overrides.arApAging ?? read(FILES.arApAging);
  const loan = overrides.loanWizard ?? read(FILES.loanWizard);
  const statements = overrides.statements ?? read(FILES.statements);
  const projections = overrides.projections ?? read(FILES.projections);
  const calculator = overrides.calculator ?? read(FILES.calculator);
  const amort = overrides.amortization ?? read(FILES.amortization);
  const routes = overrides.routes ?? read(FILES.routes);

  if (!/FINANCE_HUB_UI_FLAG/.test(hub)) failures.push("FinanceHubPage: must reference FINANCE_HUB_UI_FLAG");
  if (!/Finance Hub is not enabled for this entity/.test(hub)) failures.push("FinanceHubPage: missing disabled gate message");
  if (!/getFinanceHubOverview\s*\(/.test(hub)) failures.push("FinanceHubPage: must fetch finance hub overview");
  if (!/operating_company_id:\s*companyId/.test(hub)) failures.push("FinanceHubPage: must pass operating_company_id");
  if (!/overviewQuery\.isError[\s\S]*?<ListErrorState[\s\S]*?overviewQuery\.refetch\(\)/.test(hub)) {
    failures.push("FinanceHubPage: overview query failures must render a retryable ListErrorState");
  }

  if (!isHonestlyBuiltOrPlaceholder(overview, [/getActiveScenarioSummary\s*\(/])) {
    failures.push(
      "FinanceOverviewPage: must label itself as a future/placeholder module, or be a real flag-gated surface with an honest disabled-state message and real data fetching",
    );
  }

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

  if (!isHonestlyBuiltOrPlaceholder(projections, [/getScenarioDetail\s*\(/, /getActiveScenarioSummary\s*\(/])) {
    failures.push(
      "FinanceProjectionsPage: must be an honest placeholder, or be a real flag-gated surface with an honest disabled-state message and real data fetching",
    );
  }

  if (!/FINANCE_STATEMENTS_UI_FLAG/.test(statements)) failures.push("FinancialStatementsPage: must reference FINANCE_STATEMENTS_UI_FLAG");
  if (!/Profit & loss|Balance sheet|Trial balance/.test(statements)) failures.push("FinancialStatementsPage: must render P&L / Balance Sheet / Trial Balance tabs");
  if (!/Financial statements are not yet enabled/.test(statements)) failures.push("FinancialStatementsPage: missing disabled gate message");
  if (!/getProfitLossReport\s*\(/.test(statements) || !/getBalanceSheetReport\s*\(/.test(statements) || !/getTrialBalanceReport\s*\(/.test(statements)) {
    failures.push("FinancialStatementsPage: must call all three report APIs");
  }

  if (!/FINANCE_HUB_CALCULATOR_FLAG/.test(calculator)) failures.push("CalculatorPage: must reference FINANCE_HUB_CALCULATOR_FLAG");
  if (!/FINANCE_HUB_AMORTIZATION_FLAG/.test(amort)) failures.push("AmortizationPage: must reference FINANCE_HUB_AMORTIZATION_FLAG");
  if (!/computeCalculator\s*\(/.test(calculator)) failures.push("CalculatorPage: must call computeCalculator");
  if (!/Price \(\$\) \*/.test(calculator) || !/title=\{!calcReady/.test(calculator)) {
    failures.push("CalculatorPage: required * + disabled-button title (FINANCE-HUB-SILENT-DISABLED-BUTTON)");
  }
  if (!/createLoan\s*\(/.test(amort)) failures.push("AmortizationPage: must call createLoan");
  if (!/path="\/finance\/calculator"/.test(routes)) failures.push("routes: missing /finance/calculator route");
  if (!/path="\/finance\/amortization"/.test(routes)) failures.push("routes: missing /finance/amortization route");

  return failures;
}

/**
 * Pure, in-memory selftest — NEVER writes to disk. An earlier version of this selftest mutated the
 * REAL FinanceProjectionsPage.tsx file directly (fs.writeFileSync then restored in a finally), which
 * is unsafe: Node's process.exit() does NOT run pending finally blocks, so any path that called
 * process.exit() between the write and the restore would have left the real file permanently
 * corrupted (the exact class of bug found and fixed for verify-ap-aging-parity-surface-bar.mjs,
 * ACCT-F5524). run(overrides) now takes in-memory content, so selftest never touches disk at all.
 */
function selftest() {
  const real = {};
  for (const key of Object.keys(FILES)) real[key] = read(FILES[key]);

  const clean = run();
  if (clean.length !== 0) {
    console.error(`[verify-finance-hub-surfaces-s01-s08] SELFTEST FAIL: real tree flagged: ${clean.join("; ")}`);
    process.exit(1);
  }

  // Planted regression: strip the honest disabled/placeholder language from FinanceProjectionsPage
  // AND its real data-fetching calls — a genuinely undisclosed dishonest surface must be caught.
  const gutted = real.projections
    .replace(/not yet built|future module|placeholder/gi, "working forecasting module")
    .replace(/is not yet enabled for this company/gi, "is fully available")
    .replace(/getScenarioDetail/g, "getScenarioDetailREMOVED")
    .replace(/getActiveScenarioSummary/g, "getActiveScenarioSummaryREMOVED");
  const plantedGutted = run({ ...real, projections: gutted });
  if (!plantedGutted.some((f) => f.includes("FinanceProjectionsPage"))) {
    console.error("[verify-finance-hub-surfaces-s01-s08] SELFTEST FAIL: gutted FinanceProjectionsPage (no placeholder label AND no real API calls) was NOT caught");
    process.exit(1);
  }

  // Negative-of-the-negative: the ORIGINAL removal (placeholder language stripped, but the real
  // flag/message/API-call evidence of genuine functionality left intact) must NOT be flagged — this
  // is exactly FinanceOverviewPage/FinanceProjectionsPage's real, current, honest shape.
  const honestlyBuilt = real.projections.replace(/not yet built|future module|placeholder/gi, "working forecasting module");
  const plantedHonest = run({ ...real, projections: honestlyBuilt });
  if (plantedHonest.some((f) => f.includes("FinanceProjectionsPage"))) {
    console.error(`[verify-finance-hub-surfaces-s01-s08] SELFTEST FAIL: a genuinely-built, honestly flag-gated surface (placeholder language removed, real flag/message/API calls intact) was wrongly flagged: ${plantedHonest.join("; ")}`);
    process.exit(1);
  }

  console.log("[verify-finance-hub-surfaces-s01-s08] SELFTEST PASS (3 cases: real tree clean, gutted surface caught, honestly-built surface not flagged)");
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

main();
