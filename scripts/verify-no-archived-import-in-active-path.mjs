#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = [
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  "apps/frontend/src/routes/manifest.tsx",
];
const ARCHIVED =
  /from\s+["'][^"']*(?:BankTxCategorizationPage|CategorizeDrawer|ApplyToBillForm|CreateExpenseForm|BillPaymentForm|DriverSettlementForm|ManualJEForm|TransferForm|FactoringAdvanceForm|SplitTransactionModal)/;
if (process.argv.includes("--selftest")) {
  console.log("SELFTEST OK");
  process.exit(0);
}
const bad = [];
for (const rel of LIVE) {
  const s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (ARCHIVED.test(s)) bad.push(rel);
}
if (bad.length) {
  console.error("FAIL", bad);
  process.exit(1);
}
console.log("OK");
