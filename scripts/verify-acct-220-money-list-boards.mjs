#!/usr/bin/env node
/**
 * 443.293-C / pending row 220 — Accounting money-list tabs wrap registers in BoardSection
 * (Bills-grammar board chrome; kpiStrip stays on AccountingSubNavWrapper).
 *
 *   node scripts/verify-acct-220-money-list-boards.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-220-money-list-boards";

const SURFACES = [
  ["ExpensesListPage", "apps/frontend/src/pages/accounting/ExpensesListPage.tsx", "expenses-list-board"],
  ["ReceiptsPage", "apps/frontend/src/pages/accounting/ReceiptsPage.tsx", "receipts-list-board"],
  ["CheckListPage", "apps/frontend/src/pages/accounting/checks/CheckListPage.tsx", "checks-list-board"],
  ["InvoicesListPage", "apps/frontend/src/pages/accounting/InvoicesListPage.tsx", "invoices-list-board"],
  ["PaymentsListPage", "apps/frontend/src/pages/accounting/PaymentsListPage.tsx", "payments-list-board"],
  ["BillPaymentsListPage", "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx", "bill-payments-list-board"],
  ["VendorCreditsPage", "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx", "vendor-credits-list-board"],
  ["CreditMemosPage", "apps/frontend/src/pages/accounting/CreditMemosPage.tsx", "credit-memos-list-board"],
  ["ManualJEListPage", "apps/frontend/src/pages/accounting/ManualJEListPage.tsx", "manual-je-list-board"],
  ["FactoringListPage", "apps/frontend/src/pages/accounting/FactoringListPage.tsx", "factoring-list-board"],
  ["PrepaidExpensesPage", "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx", "prepaid-expenses-list-board"],
  ["FixedAssetsPage", "apps/frontend/src/pages/accounting/FixedAssetsPage.tsx", "fixed-assets-list-board"],
];

const fails = [];
for (const [id, rel, testId] of SURFACES) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (!src.includes('from "../../components/v3/BoardSection"') && !src.includes('from "../../../components/v3/BoardSection"')) {
    fails.push(`${id}: must import BoardSection from components/v3/BoardSection`);
  }
  const re = new RegExp(`<BoardSection[\\s\\S]{0,220}testId=["']${testId}["']`);
  if (!re.test(src)) {
    fails.push(`${id}: must wrap register in <BoardSection … testId="${testId}">`);
  }
  if (!src.includes("kpiStrip") || !src.includes("moneyListKpiCard")) {
    fails.push(`${id}: must keep AccountingSubNavWrapper kpiStrip + moneyListKpiCard (Bills grammar)`);
  }
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${SURFACES.length} Accounting money-list registers use BoardSection`);
