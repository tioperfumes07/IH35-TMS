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
  const listQuery = routes.match(/export async function queryExpensesList[\s\S]*?(?=export async function registerExpenseRoutes)/)?.[0] ?? "";
  const backendRowType = routes.match(/export type ExpenseListRow = \{[\s\S]*?\n\};/)?.[0] ?? "";
  const frontendRowType = api.match(/export type ExpenseListRow = \{[\s\S]*?\n\};/)?.[0] ?? "";
  if (!/linked_work_order_uuid::text\s+AS linked_work_order_uuid/.test(listQuery)) {
    errors.push("expenses.routes list query must SELECT linked_work_order_uuid");
  }
  if (!/LEFT JOIN maintenance\.work_orders wo\s+ON wo\.id = e\.linked_work_order_uuid\s+AND wo\.operating_company_id = e\.operating_company_id/.test(listQuery)) {
    errors.push("expenses.routes list query must same-company LEFT JOIN work_orders for display_id");
  }
  if (!/linked_work_order_uuid:\s*string \| null/.test(backendRowType)) {
    errors.push("backend ExpenseListRow must include linked_work_order_uuid");
  }
  if (!/linked_work_order_uuid:\s*string \| null/.test(frontendRowType)) {
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

if (process.argv.includes("--selftest")) {
  const plants = [
    ["WO FK projection", { routes: routes.replace("e.linked_work_order_uuid::text               AS linked_work_order_uuid", "NULL::text AS removed_work_order_uuid"), api, listPage }],
    ["WO same-company join", { routes: routes.replace("AND wo.operating_company_id = e.operating_company_id", "AND true"), api, listPage }],
    ["backend row type", { routes: routes.replace("linked_work_order_uuid: string | null;", "removed_work_order_uuid: string | null;"), api, listPage }],
    ["frontend row type", { routes, api: api.replace("linked_work_order_uuid: string | null;", "removed_work_order_uuid: string | null;"), listPage }],
    ["WO column label", { routes, api, listPage: listPage.replace('label: "WO"', 'label: "Removed"') }],
    ["canonical WO kind", { routes, api, listPage: listPage.replace('kind="work_order"', 'kind="removed"') }],
  ];
  let caught = 0;
  for (const [name, fixture] of plants) {
    if (!check(fixture).length) {
      console.error(`${LABEL} --selftest FAIL — plant escaped: ${name}`);
      process.exit(1);
    }
    caught += 1;
  }
  console.log(`${LABEL} --selftest PASS — ${caught}/${plants.length} independent WO reverse mutations caught`);
  process.exit(0);
}

const errors = check({ listPage, api, routes });
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
