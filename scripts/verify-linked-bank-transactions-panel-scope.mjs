#!/usr/bin/env node
/** @matrix-built {"modules":["banking"],"cols":["bank","gl_je","connectivity","reverse_link"],"leafRe":"^banking\\.panel\\.linked_bank_transactions$","task":"ACCT-F5663-linked-bank-panel-scope","vertical":"column-wave"} */
import fs from "node:fs";
import process from "node:process";

const route = fs.readFileSync("apps/backend/src/banking/categorization.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/banking.ts", "utf8");
const panel = fs.readFileSync("apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx", "utf8");

function verify(r, a, p) {
  const failures = [];
  if (!r.includes("ded.operating_company_id = bt.operating_company_id")) failures.push("deduction join is not company-scoped");
  if (!r.includes("je.operating_company_id = bt.operating_company_id")) failures.push("journal-entry join is not company-scoped");
  if (!a.includes("rows: LinkedBankTransactionRow[]")) failures.push("API still erases the reverse-row contract");
  if (p.includes("as LinkageRow[]")) failures.push("panel still casts an untyped API response");
  if (!p.includes('kind="bank_transaction"') || !p.includes('kind="journal_entry"')) failures.push("mounted reverse drills are missing");
  if (!p.includes("query.isError") || !p.includes("query.isSuccess && rows.length === 0")) failures.push("panel conflates fetch failure with an empty reverse set");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [route.replace("ded.operating_company_id = bt.operating_company_id", "TRUE"), api, panel],
    [route.replace("je.operating_company_id = bt.operating_company_id", "TRUE"), api, panel],
    [route, api.replace("rows: LinkedBankTransactionRow[]", "rows: Array<Record<string, unknown>>"), panel],
    [route, api, panel.replace('kind="journal_entry"', 'kind="account"')],
  ];
  mutations.forEach((mutation, index) => { if (verify(...mutation).length === 0) throw new Error(`selftest mutation ${index + 1} escaped`); });
  console.log("verify-linked-bank-transactions-panel-scope SELFTEST PASS (4/4)");
  process.exit(0);
}
const failures = verify(route, api, panel);
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log("verify-linked-bank-transactions-panel-scope PASS — scoped deductions/JEs, typed rows, and mounted drills are guarded");
