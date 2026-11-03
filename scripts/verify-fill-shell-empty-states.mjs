#!/usr/bin/env node
/** Fill-not-shell — FactoringHome empty/loading, BatchWizard, Fuel planner settings states use BoardSection/FuelBoardSection. */
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", "BoardSection", "factoring-home-loading", "FactoringHome loading"],
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", "BoardSection", "factoring-home-need-company", "FactoringHome need-company"],
  ["apps/frontend/src/pages/factoring/BatchWizard.tsx", "BoardSection", "factoring-batch-wizard-board", "BatchWizard body"],
  ["apps/frontend/src/pages/factoring/BatchWizard.tsx", "BoardSection", "factoring-batches-need-company", "BatchWizard need-company"],
  ["apps/frontend/src/pages/factoring/Faro1090WireProposalsPage.tsx", "BoardSection", "faro-1090-need-company", "Faro1090 need-company"],
  ["apps/frontend/src/pages/factoring/FactorAdmin.tsx", "BoardSection", "factor-admin-need-company", "FactorAdmin need-company"],
  ["apps/frontend/src/pages/factoring/FaroDebtorRecordPage.tsx", "BoardSection", "faro-debtor-need-company", "FaroDebtor need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementsPage.tsx", "BoardSection", "settlements-need-company", "Settlements need-company"],
  ["apps/frontend/src/pages/driver-finance/BatchSettlementsPage.tsx", "BoardSection", "batch-settlements-need-company", "BatchSettlements need-company"],
  ["apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx", "BoardSection", "company-settlements-need-company", "CompanySettlements need-company"],
  ["apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx", "BoardSection", "escrow-register-need-company", "EscrowRegister need-company"],
  ["apps/frontend/src/pages/driver-finance/DriverBillDetailPage.tsx", "BoardSection", "driver-bill-detail-need-company", "DriverBillDetail need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementsPreSettlementsBoard.tsx", "BoardSection", "settlements-presettle-need-company", "PreSettlements need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementsCashAdvancesBoard.tsx", "BoardSection", "settlements-cash-advances-need-company", "CashAdvances need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementsDeductionsBoard.tsx", "BoardSection", "settlements-deductions-need-company", "Deductions need-company"],
  ["apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx", "BoardSection", "escrow-deductions-pending-need-company", "EscrowDeductionsPending need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx", "BoardSection", "settlement-detail-need-company", "SettlementDetail need-company"],
  ["apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx", "BoardSection", "settlement-workflow-need-company", "SettlementWorkflow need-company"],
  ["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", "FuelBoardSection", "fuel-planner-settings-loading", "Planner settings loading"],
  ["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", "FuelBoardSection", "fuel-planner-settings-unavailable", "Planner settings unavailable"],
  ["apps/frontend/src/pages/finance/BreakEvenPage.tsx", "BoardSection", "break-even-need-company", "BreakEven need-company"],
  ["apps/frontend/src/pages/finance/FinanceHubPage.tsx", "BoardSection", "finance-hub-need-company", "FinanceHub need-company"],
  ["apps/frontend/src/pages/finance/AmortizationPage.tsx", "BoardSection", "amortization-need-company", "Amortization need-company"],
];

const selftest = process.argv.includes("--selftest");

function analyze(sources) {
  const e = [];
  for (const [rel, tag, testId, label] of checks) {
    const src = sources[rel] ?? "";
    if (!src.includes(`<${tag}`) || !src.includes(`testId="${testId}"`)) {
      e.push(`${rel}: ${label} must use ${tag} (testId=${testId})`);
    }
  }
  return e;
}

const base = Object.fromEntries([...new Set(checks.map((c) => c[0]))].map((rel) => [rel, fs.readFileSync(rel, "utf8")]));

if (selftest) {
  const clean = analyze(base);
  if (clean.length) {
    console.error("SELFTEST FAIL live:\n- " + clean.join("\n- "));
    process.exit(1);
  }
  const planted = {
    ...base,
    "apps/frontend/src/pages/factoring/FactoringHome.tsx": base["apps/frontend/src/pages/factoring/FactoringHome.tsx"].replace(/<BoardSection/g, "<div"),
  };
  if (!analyze(planted).length) {
    console.error("SELFTEST FAIL plant escaped");
    process.exit(1);
  }
  console.log("PASS verify-fill-shell-empty-states --selftest");
  process.exit(0);
}

const fails = analyze(base);
if (fails.length) {
  console.error("FAIL verify-fill-shell-empty-states");
  fails.forEach((f) => console.error("- " + f));
  process.exit(1);
}
console.log("PASS verify-fill-shell-empty-states");
