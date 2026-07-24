#!/usr/bin/env node
/**
 * Guard: Pay Bill for source_system=qbo must record subledger payment WITHOUT inventing a TMS JE.
 *
 * After #3386 refuses Bill→GL for QBO mirrors, BILL_PAYMENT_GL_POSTING_ENABLED ON + atomic
 * postSourceTransactionInClientTx inside payBill threw BILL_AP_NOT_POSTED and rolled back the
 * entire payment — leaving bill_payments=0 forever on ~16k QBO open bills (Smoke C blocked).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-bill-payment-subledger-only";
const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const engine = read("apps/backend/src/accounting/posting-engine.service.ts");
const bills = read("apps/backend/src/accounting/bills.service.ts");

if (!/QBO_BILL_PAYMENT_POST_GL_REFUSED/.test(engine)) {
  failures.push("posting-engine must define QBO_BILL_PAYMENT_POST_GL_REFUSED");
}
if (!/source_system[\s\S]{0,80}qbo[\s\S]{0,200}QBO_BILL_PAYMENT_POST_GL_REFUSED/.test(engine)) {
  failures.push("buildBillPaymentLines must refuse GL when bill.source_system is qbo");
}
if (!/qbo_parallel_books/.test(bills)) {
  failures.push("payBill must surface gl_posting reason qbo_parallel_books for QBO bills");
}
if (!/isQboBill/.test(bills)) {
  failures.push("payBill must detect QBO bills via isQboBill");
}
// Nested gate: if (glPostingEnabled) { if (!isQboBill) { post... } } — preserves flag-OFF pay path
// (verify-bill-payment-posts-gl) AND skips invent JE for QBO (parallel books).
if (!/if\s*\(\s*glPostingEnabled\s*\)\s*\{[\s\S]*?if\s*\(\s*!isQboBill\s*\)\s*\{[\s\S]*?postSourceTransactionInClientTx/.test(bills)) {
  failures.push("payBill must nest JE post as if(glPostingEnabled){ if(!isQboBill){ post... } } (QBO carve-out + flag gate)");
}
if (/if\s*\(\s*glPostingEnabled\s*\)\s*\{\s*await\s+postSourceTransactionInClientTx/.test(bills)) {
  failures.push("payBill must not post GL for every flag-ON bill (QBO carve-out required between gate and post)");
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (QBO bill payments = TMS subledger only; no invent JE)`);
