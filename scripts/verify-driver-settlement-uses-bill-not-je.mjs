#!/usr/bin/env node
// Driver settlements pay through DOCUMENTS: a bill per load and bill payments against it (A/P is written only by its
// documents, ROUND 393.1). LST-F426: the retired payroll writer this guard used to read is deleted; it now holds the
// live writer — the pay-run's per-load A/P chain — to the rule, and refuses the retired writer coming back.
import fs from "node:fs";
import path from "node:path";

const chainPath = path.join(process.cwd(), "apps/backend/src/driver-finance/settlement-ap-chain.service.ts");
const retiredPath = path.join(process.cwd(), "apps/backend/src/payroll/driver-settlement.service.deprecated.ts");

function fail(message) {
  console.error(`verify:driver-settlement-uses-bill-not-je — FAILED\n- ${message}`);
  process.exit(1);
}

export function check(source, retiredExists) {
  const problems = [];
  if (retiredExists) problems.push("the retired payroll settlement writer (driver-settlement.service.deprecated.ts) is back — it was deleted (LST-F426)");
  if (!source.includes("createBillInClientTx(")) problems.push("the settlement chain must create the per-load accounting Bill (createBillInClientTx)");
  if (!source.includes("payBillInClientTx(")) problems.push("the settlement chain must pay through accounting BillPayments (payBillInClientTx)");
  if (/INSERT INTO accounting\.journal_entr/i.test(source)) problems.push("the settlement chain must not insert journal entries directly");
  // Its one application entry is sourced to the settlement (393.1 admits a driver_settlement debit on A/P), never manual.
  for (const m of source.matchAll(/createJournalEntryOnClient\([\s\S]{0,400}?source_transaction_type:\s*"([a-z_]+)"/g)) {
    if (!["driver_settlement", "bill_payment", "bill"].includes(m[1])) problems.push(`the settlement chain posts a journal entry sourced "${m[1]}" — it must be a settlement / bill / bill payment document`);
  }
  if (/source:\s*"manual"/.test(source)) problems.push("the settlement chain must not post a manual journal entry");
  return problems;
}

if (!fs.existsSync(chainPath)) fail(`missing required file: ${chainPath}`);
const source = fs.readFileSync(chainPath, "utf8");

if (process.argv.includes("--selftest")) {
  const real = check(source, false);
  if (real.length) fail(`selftest: real source rejected: ${real.join("; ")}`);
  const plants = [
    ["retired writer restored", source, true],
    ["bills dropped", source.replaceAll("createBillInClientTx(", "createNothing("), false],
    ["payments dropped", source.replaceAll("payBillInClientTx(", "payNothing("), false],
    ["application entry made manual", source.replace('source_transaction_type: "driver_settlement"', 'source_transaction_type: "journal_entry"'), false],
  ];
  for (const [name, src, retired] of plants) {
    if (!retired && src === source) fail(`selftest: plant "${name}" changed nothing (inert)`);
    if (check(src, retired).length === 0) fail(`selftest: plant "${name}" NOT caught`);
  }
  console.log(`verify:driver-settlement-uses-bill-not-je --selftest PASS — ${plants.length}/${plants.length} plants caught`);
  process.exit(0);
}

const problems = check(source, fs.existsSync(retiredPath));
if (problems.length) fail(problems.join("\n- "));
console.log("verify:driver-settlement-uses-bill-not-je — OK (per-load bills + bill payments; the retired payroll writer stays deleted)");
