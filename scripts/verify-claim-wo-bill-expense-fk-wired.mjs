#!/usr/bin/env node
/**
 * Claim→WO→Bill/Expense wiring guard (follow-on to held migration 202607740000).
 * Ensures create/list reverse paths accept insurance_claim_id and claim graph probes columns.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const billsService = read("apps/backend/src/accounting/bills.service.ts");
const billsRoutes = read("apps/backend/src/accounting/bills.routes.ts");
const expensesRoutes = read("apps/backend/src/accounting/expenses.routes.ts");
const claimRoutes = read("apps/backend/src/insurance/claim.routes.ts");

if (!/listClaimLinkedFinancials/.test(billsService)) {
  failures.push("bills.service must export listClaimLinkedFinancials");
}
if (!/insuranceClaimId/.test(billsService) || !/insurance_claim_id/.test(billsService)) {
  failures.push("createBill must persist insurance_claim_id when column exists");
}
if (!/\/api\/v1\/accounting\/claims\/:id\/linked-financials/.test(billsRoutes)) {
  failures.push("bills.routes must mount GET /accounting/claims/:id/linked-financials");
}
if (!/insurance_claim_id:\s*z\.string\(\)\.uuid\(\)/.test(billsRoutes)) {
  failures.push("createBill body schema must accept insurance_claim_id");
}
if (!/insurance_claim_id:\s*z\.string\(\)\.uuid\(\)/.test(expensesRoutes)) {
  failures.push("createExpense body schema must accept insurance_claim_id");
}
if (!/columnExists\(client,\s*"accounting",\s*"expenses",\s*"insurance_claim_id"\)/.test(expensesRoutes)) {
  failures.push("expense create must column-gate insurance_claim_id insert");
}
if (!/hasExpenseClaim/.test(claimRoutes) || !/insurance_claim_id on this DB/.test(claimRoutes)) {
  failures.push("claim graph must probe insurance_claim_id columns and report honest gaps");
}

if (failures.length) {
  console.error("verify-claim-wo-bill-expense-fk-wired FAILED:");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log("verify-claim-wo-bill-expense-fk-wired — OK");
