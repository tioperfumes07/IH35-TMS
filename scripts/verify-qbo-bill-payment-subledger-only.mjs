#!/usr/bin/env node
/** 9a contract only: BillPayment GL builder must not refuse by QBO origin.
 * Existing payBill caller assertions remain until the separate 9b writer change replaces them atomically.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeNativeDocumentGl, runNativeDocumentGlSelftest } from "./lib/native-document-gl-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enginePath = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");
const billsPath = path.join(ROOT, "apps/backend/src/accounting/bills.service.ts");
if (process.argv.includes("--selftest")) {
  const results = runNativeDocumentGlSelftest(fs.readFileSync(enginePath, "utf8"));
  const failed = results.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-qbo-bill-payment-subledger-only --selftest: FAIL", failed);
    process.exit(1);
  }
  console.log("verify-qbo-bill-payment-subledger-only --selftest: PASS");
  process.exit(0);
}
const failures = analyzeNativeDocumentGl(fs.readFileSync(enginePath, "utf8"));
const bills = fs.readFileSync(billsPath, "utf8");
if (!/qbo_parallel_books/.test(bills)) failures.push("9b transitional assertion: payBill no longer surfaces gl_posting reason qbo_parallel_books");
if (!/isQboBill/.test(bills)) failures.push("9b transitional assertion: payBill no longer detects QBO bills via isQboBill");
if (!/if\s*\(\s*(?:flags\.)?glPostingEnabled\s*\)\s*\{[\s\S]*?if\s*\(\s*!isQboBill[\s\S]{0,120}\)\s*\{[\s\S]*?postSourceTransactionInClientTx/.test(bills)) {
  failures.push("9b transitional assertion: payBill must keep the glPostingEnabled + !isQboBill gate before posting");
}
if (/if\s*\(\s*(?:flags\.)?glPostingEnabled\s*\)\s*\{\s*await\s+postSourceTransactionInClientTx/.test(bills)) {
  failures.push("9b transitional assertion: payBill must not post GL for every flag-ON bill");
}
if (failures.length) {
  console.error("verify-qbo-bill-payment-subledger-only: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-qbo-bill-payment-subledger-only: PASS (9a native builder/CHAIN-04; transitional payBill assertions retained pending 9b)");
