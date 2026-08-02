#!/usr/bin/env node
/**
 * GUARD 2026-08-02 — Expense "Payment method" is server-required but was missing `*`
 * while "Payment account *" showed the marker. Label/validation parity.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = "apps/frontend/src/components/expenses/RecordExpenseForm.tsx";
const BANK = "apps/frontend/src/pages/banking/components/forms/CreateExpenseForm.tsx";
const SUBMIT = "apps/frontend/src/components/expenses/recordExpenseSubmit.ts";
const LABEL = "verify-expense-payment-method-required-star";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(sources = { record: read(RECORD), bank: read(BANK), submit: read(SUBMIT) }) {
  const problems = [];
  if (!/Payment method is required/.test(sources.submit)) {
    problems.push(`${SUBMIT}: must keep server-side "Payment method is required"`);
  }
  if (!/Payment method \*/.test(sources.record)) {
    problems.push(`${RECORD}: Payment method label must include required marker *`);
  }
  if (/Payment method\n/.test(sources.record) && !/Payment method \*/.test(sources.record)) {
    problems.push(`${RECORD}: bare "Payment method" without * still present`);
  }
  if (!/Payment account \*/.test(sources.record)) {
    problems.push(`${RECORD}: Payment account * must remain (parity baseline)`);
  }
  if (!/Payment Method \*/.test(sources.bank) && !/label=\"Payment Method \*\"/.test(sources.bank)) {
    problems.push(`${BANK}: Payment Method Field label must include *`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = { record: read(RECORD), bank: read(BANK), submit: read(SUBMIT) };
  const broken = {
    ...real,
    record: real.record.replace("Payment method *", "Payment method"),
    bank: real.bank.replace("Payment Method *", "Payment Method"),
  };
  if (collectProblems(broken).length < 2) {
    console.error(`${LABEL} --selftest FAIL: broken fixture not flagged`);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — Payment method * matches required validation on Record + Create expense forms`);
}
