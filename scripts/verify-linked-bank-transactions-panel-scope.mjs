#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking"],"cols":["bank","gl_je","connectivity","reverse_link"],"leafRe":"^banking\\.panel\\.linked_bank_transactions$","task":"ACCT-F5663-linked-bank-panel-scope","vertical":"column-wave"} */
import fs from "node:fs";
import process from "node:process";

const route = fs.readFileSync("apps/backend/src/banking/categorization.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/banking.ts", "utf8");
const panel = fs.readFileSync("apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx", "utf8");
const accountingMatrix = fs.readFileSync("docs/specs/scoreboard/modules/accounting.required.json", "utf8");
const bankingMatrix = fs.readFileSync("docs/specs/scoreboard/modules/banking.required.json", "utf8");

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

/**
 * The empty-state paragraph's *condition* is what must never fire on error/pending — not a fixed
 * string. Later hops (e.g. the split-line reverse query) legitimately AND more clauses into it
 * (`splitQuery.isSuccess && ... && splitRows.length === 0`), which a rigid substring match would
 * reject as a false regression. Isolate the JSX conditional guarding the empty-state testid and
 * assert its required tokens are present, in any order/composition.
 */
function emptyStateCondition(source) {
  const marker = 'data-testid="linked-bank-transactions-empty"';
  const idx = source.indexOf(marker);
  if (idx < 0) return "";
  return source.slice(Math.max(0, idx - 400), idx);
}

function verify(r, a, p, accounting = accountingMatrix, banking = bankingMatrix) {
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
  if (!p.includes("query.isError")) failures.push("panel conflates fetch failure with an empty reverse set");
  const emptyCondition = emptyStateCondition(p);
  if (!emptyCondition.includes("isSuccess") || !emptyCondition.includes("rows.length === 0")) {
    failures.push("panel conflates fetch failure with an empty reverse set");
  }
  for (const [module, matrix] of [["accounting", accounting], ["banking", banking]]) {
    try {
      const leaf = JSON.parse(matrix).leaves?.find((item) => item.id === "banking.panel.linked_bank_transactions");
      for (const column of ["bank", "gl_je", "connectivity", "reverse_link"]) {
        if (!leaf?.required?.includes(column)) failures.push(`${module} exact linked-bank leaf does not own ${column}`);
      }
    } catch {
      failures.push(`${module} Required matrix does not parse`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [mutateByLinkage(route, "ded.operating_company_id = bt.operating_company_id", "TRUE"), api, panel, accountingMatrix, bankingMatrix],
    [mutateByLinkage(route, "je.operating_company_id = bt.operating_company_id", "TRUE"), api, panel, accountingMatrix, bankingMatrix],
    [mutateByLinkage(route, "bt.operating_company_id = $1::uuid", "TRUE"), api, panel, accountingMatrix, bankingMatrix],
    [mutateByLinkage(route, "AND bt.voided_at IS NULL", "AND TRUE"), api, panel, accountingMatrix, bankingMatrix],
    [route, api.replace("rows: LinkedBankTransactionRow[]", "rows: Array<Record<string, unknown>>"), panel, accountingMatrix, bankingMatrix],
    // .replaceAll (not .replace): the panel now mounts each drill kind twice (main row list +
    // split-line list from the later split-query hop) — a first-occurrence-only replace would
    // leave the second copy intact and the mutation would silently escape detection.
    [route, api, panel.replaceAll('kind="journal_entry"', 'kind="account"'), accountingMatrix, bankingMatrix],
    [route, api, panel.replaceAll('kind="bank_transaction"', 'kind="load"'), accountingMatrix, bankingMatrix],
    [route, api, panel.replace("query.isError", "query.isPending"), accountingMatrix, bankingMatrix],
    [
      route,
      api,
      (() => {
        const mutated = panel.replace(
          "query.isSuccess && splitQuery.isSuccess && rows.length === 0 && splitRows.length === 0",
          "rows.length === 0 && splitRows.length === 0",
        );
        if (mutated === panel) throw new Error("selftest fixture drifted: empty-state isSuccess gate");
        return mutated;
      })(),
      accountingMatrix,
      bankingMatrix,
    ],
    [route, api, `${panel}\nas LinkageRow[]`, accountingMatrix, bankingMatrix],
    [route, api, panel, accountingMatrix.replace('"id": "banking.panel.linked_bank_transactions"', '"id": "banking.panel.linked_bank_transactions.removed"'), bankingMatrix],
    [route, api, panel, accountingMatrix, bankingMatrix.replace('"id": "banking.panel.linked_bank_transactions"', '"id": "banking.panel.linked_bank_transactions.removed"')],
  ];
  mutations.forEach((mutation, index) => { if (verify(...mutation).length === 0) throw new Error(`selftest mutation ${index + 1} escaped`); });
  console.log(`verify-linked-bank-transactions-panel-scope SELFTEST PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}
const failures = verify(route, api, panel);
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log("verify-linked-bank-transactions-panel-scope PASS — scoped deductions/JEs, typed rows, and mounted drills are guarded");
