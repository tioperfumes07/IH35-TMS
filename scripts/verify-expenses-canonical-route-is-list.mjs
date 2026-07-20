#!/usr/bin/env node
/**
 * verify-expenses-canonical-route-is-list — bare /accounting/expenses must be the list.
 *
 * Owns the expenses-list-routing-bug contract: canonical path renders ExpensesListPage,
 * not ExpenseCreatePage. /new and /list remain additive aliases.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expenses-canonical-route-is-list";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function routeR(route, component) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `path=["']${escaped}["'](?:(?!path=["'])[\\s\\S]){0,400}?<${component}\\s*\\/>`,
  );
}

function assertCanonical(manifest) {
  const errors = [];
  if (!routeR("/accounting/expenses", "ExpensesListPage").test(manifest)) {
    errors.push(`${MANIFEST}: path /accounting/expenses must render <ExpensesListPage />`);
  }
  if (routeR("/accounting/expenses", "ExpenseCreatePage").test(manifest)) {
    errors.push(`${MANIFEST}: path /accounting/expenses must not render <ExpenseCreatePage />`);
  }
  if (!routeR("/accounting/expenses/list", "ExpensesListPage").test(manifest)) {
    errors.push(`${MANIFEST}: additive alias /accounting/expenses/list must remain ExpensesListPage`);
  }
  if (!routeR("/accounting/expenses/new", "ExpenseCreatePage").test(manifest)) {
    errors.push(`${MANIFEST}: additive alias /accounting/expenses/new must remain ExpenseCreatePage`);
  }
  return errors;
}

function selftest() {
  const good = `
    path="/accounting/expenses/new" element={<ProtectedRoute><ExpenseCreatePage /></ProtectedRoute>}
    path="/accounting/expenses/list" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}
    path="/accounting/expenses" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}
  `;
  const bad = good.replace(
    'path="/accounting/expenses" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}',
    'path="/accounting/expenses" element={<ProtectedRoute><ExpenseCreatePage /></ProtectedRoute>}',
  );
  if (assertCanonical(good).length) {
    console.error(`${LABEL} SELFTEST FAILED — good fixture rejected`);
    process.exit(1);
  }
  if (!assertCanonical(bad).some((e) => e.includes("must not render"))) {
    console.error(`${LABEL} SELFTEST FAILED — wizard regression not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const manifest = fs.readFileSync(path.join(ROOT, MANIFEST), "utf8");
const errors = assertCanonical(manifest);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — /accounting/expenses → ExpensesListPage`);
process.exit(0);
