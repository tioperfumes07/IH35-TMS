#!/usr/bin/env node
/**
 * verify-acct-expense-list-wo-reverse — Law §9 expense browse WO reverse (follow-on to vendor/JE).
 *
 * ROOT CAUSE: ExpensesListPage / GET /api/v1/expenses omitted linked_work_order_uuid while
 * expense detail already EntityLinked WO — browse grid was a reverse dead-end.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-expense-list-wo-reverse";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check({ listPage, api, routes }) {
  const errors = [];
  if (!/linked_work_order_uuid::text\s+AS linked_work_order_uuid/.test(routes)) {
    errors.push("expenses.routes list query must SELECT linked_work_order_uuid");
  }
  if (!/LEFT JOIN maintenance\.work_orders wo ON wo\.id = e\.linked_work_order_uuid/.test(routes)) {
    errors.push("expenses.routes list query must LEFT JOIN work_orders for display_id");
  }
  if (!/export type ExpenseListRow[\s\S]*linked_work_order_uuid:\s*string \| null/.test(routes)) {
    errors.push("backend ExpenseListRow must include linked_work_order_uuid");
  }
  if (!/export type ExpenseListRow[\s\S]*linked_work_order_uuid:\s*string \| null/.test(api)) {
    errors.push("frontend ExpenseListRow must include linked_work_order_uuid");
  }
  if (!listPage.includes('label: "WO"') || !/kind="work_order"/.test(listPage) || !/linked_work_order_uuid/.test(listPage)) {
    errors.push("ExpensesListPage must render WO column with EntityLink kind=work_order");
  }
  return errors;
}

const routes = read("apps/backend/src/accounting/expenses.routes.ts");
const api = read("apps/frontend/src/api/accounting.ts");
const listPage = read("apps/frontend/src/pages/accounting/ExpensesListPage.tsx");
const errors = check({ listPage, api, routes });
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
