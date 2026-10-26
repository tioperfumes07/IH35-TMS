#!/usr/bin/env node
/**
 * Horizontal fill-not-shell batch — Settlements detail sections + Accounting
 * remaining registers wrap in BoardSection (engines/actions preserved).
 *
 *   node scripts/verify-fill-remaining-boards-batch.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fill-remaining-boards-batch";

const SURFACES = [
  ["EarningsSection", "apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx", "settlement-earnings-board", ["ParityTable", "earnings-section-table"]],
  ["DeductionsSection", "apps/frontend/src/pages/driver-finance/components/DeductionsSection.tsx", "settlement-deductions-board", ["deductions-section-add", "ParityTable"]],
  ["ExtraPaySection", "apps/frontend/src/pages/driver-finance/components/ExtraPaySection.tsx", "settlement-extra-pay-board", ["Add additional pay", "ParityTable"]],
  ["ReimbursementsSection", "apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx", "settlement-reimbursements-board", ["Add reimbursement", "ParityTable"]],
  ["FuelPurchasesSection", "apps/frontend/src/pages/driver-finance/components/FuelPurchasesSection.tsx", "settlement-fuel-purchases-board", ["ParityTable"]],
  ["DeadheadPaySection", "apps/frontend/src/pages/driver-finance/components/DeadheadPaySection.tsx", "settlement-deadhead-pay-board", ["ParityTable"]],
  ["SettlementLoadsSection", "apps/frontend/src/pages/driver-finance/components/SettlementLoadsSection.tsx", "settlement-loads-section", ["ParityTable"]],
  ["MonthClosePage", "apps/frontend/src/pages/accounting/MonthClosePage.tsx", "month-close-checklist-board", ["Close month", "FORM_INPUT_CLASS"]],
  ["SalesTaxPage", "apps/frontend/src/pages/accounting/SalesTaxPage.tsx", "sales-tax-returns-board", ["FORM_INPUT_CLASS", "sales-tax-returns-table"]],
  ["OpeningBalanceRegisterPage", "apps/frontend/src/pages/accounting/OpeningBalanceRegisterPage.tsx", "opening-balance-register-board", ["Commit opening balances"]],
  ["CreateMultipleBillsPage", "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx", "create-multiple-bills-board", ["createVendorBill", "create-multiple-bills-table"]],
  ["DailyReconPage", "apps/frontend/src/pages/accounting/DailyReconPage.tsx", "daily-recon-empty-board", ["MoneyListToolbar", "fetchDailyRecon"]],
  ["AccountRegisterPage", "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx", "account-register-lines-board", ["b1-account-register", "account-register-audit-board"]],
];

const fails = [];
for (const [id, rel, testId, keep] of SURFACES) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (!src.includes("components/v3/BoardSection")) {
    fails.push(`${id}: must import BoardSection`);
  }
  const re = new RegExp(`<BoardSection[\\s\\S]{0,320}testId=["']${testId}["']`);
  if (!re.test(src) && !src.includes(`testId="${testId}"`)) {
    fails.push(`${id}: missing BoardSection testId=${testId}`);
  }
  for (const k of keep) {
    if (!src.includes(k)) fails.push(`${id}: must keep ${k}`);
  }
  if (/<section className="rounded-sm border border-gray-200 bg-white"/.test(src)) {
    fails.push(`${id}: still has bare rounded section shell`);
  }
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${SURFACES.length} Settlements/Accounting surfaces BoardSection-filled`);
