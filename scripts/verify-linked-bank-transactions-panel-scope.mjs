#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking"],"cols":["bank","gl_je","connectivity","reverse_link"],"leafRe":"^banking\\.panel\\.linked_bank_transactions$","task":"ACCT-F5663-linked-bank-panel-scope","vertical":"column-wave"} */
import fs from "node:fs";
import process from "node:process";

const route = fs.readFileSync("apps/backend/src/banking/categorization.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/banking.ts", "utf8");
const panel = fs.readFileSync("apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx", "utf8");

function byLinkageHandler(source) {
  const marker = 'app.get("/api/v1/banking/transactions/by-linkage"';
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const next = source.indexOf("\n  app.", start + marker.length);
  return source.slice(start, next < 0 ? undefined : next);
}

function mutateByLinkage(source, from, to) {
  const handler = byLinkageHandler(source);
  if (!handler.includes(from)) throw new Error(`selftest fixture drifted: ${from}`);
  return source.replace(handler, handler.replace(from, to));
}

function verify(r, a, p) {
  const failures = [];
  const handler = byLinkageHandler(r);
  if (!handler) failures.push("by-linkage reverse route is not mounted");
  if (!handler.includes("bt.operating_company_id = $1::uuid")) failures.push("bank-transaction read is not company-scoped");
  if (!handler.includes("ded.operating_company_id = bt.operating_company_id")) failures.push("deduction join is not company-scoped");
  if (!handler.includes("je.operating_company_id = bt.operating_company_id")) failures.push("journal-entry join is not company-scoped");
  if (!handler.includes("AND bt.voided_at IS NULL")) failures.push("voided bank transactions can leak into reverse panels");
  if (!a.includes("rows: LinkedBankTransactionRow[]")) failures.push("API still erases the reverse-row contract");
  if (p.includes("as LinkageRow[]")) failures.push("panel still casts an untyped API response");
  if (!p.includes('kind="bank_transaction"') || !p.includes('kind="journal_entry"')) failures.push("mounted reverse drills are missing");
  if (!p.includes("query.isError") || !p.includes("query.isSuccess && rows.length === 0")) failures.push("panel conflates fetch failure with an empty reverse set");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [mutateByLinkage(route, "ded.operating_company_id = bt.operating_company_id", "TRUE"), api, panel],
    [mutateByLinkage(route, "je.operating_company_id = bt.operating_company_id", "TRUE"), api, panel],
    [mutateByLinkage(route, "bt.operating_company_id = $1::uuid", "TRUE"), api, panel],
    [mutateByLinkage(route, "AND bt.voided_at IS NULL", "AND TRUE"), api, panel],
    [route, api.replace("rows: LinkedBankTransactionRow[]", "rows: Array<Record<string, unknown>>"), panel],
    [route, api, panel.replace('kind="journal_entry"', 'kind="account"')],
  ];
  mutations.forEach((mutation, index) => { if (verify(...mutation).length === 0) throw new Error(`selftest mutation ${index + 1} escaped`); });
  console.log(`verify-linked-bank-transactions-panel-scope SELFTEST PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}
const failures = verify(route, api, panel);
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log("verify-linked-bank-transactions-panel-scope PASS — scoped deductions/JEs, typed rows, and mounted drills are guarded");
