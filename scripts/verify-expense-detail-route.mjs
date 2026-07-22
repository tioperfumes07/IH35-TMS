#!/usr/bin/env node
/**
 * Rule-17 guard: expense detail reverse drill-through (Law §9 / LAW-E2E expense FAIL #1).
 * Locks GET /api/v1/expenses/:id + FE detail route + EntityLink → /accounting/expenses/:id.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-detail-route";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertExpenseDetailRoute() {
  const errors = [];
  const routes = read("apps/backend/src/accounting/expenses.routes.ts");
  const entityLink = read("apps/frontend/src/components/shared/EntityLink.tsx");
  const detailPage = read("apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx");
  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  const api = read("apps/frontend/src/api/accounting.ts");

  if (!/app\.get\(\s*["']\/api\/v1\/expenses\/:id["']/.test(routes)) {
    errors.push("backend: GET /api/v1/expenses/:id must be registered");
  }
  if (!/journal_entry_id/.test(routes) || !/expense_lines/.test(routes)) {
    errors.push("backend: detail handler must select journal_entry_id and expense_lines");
  }
  if (!/withCompanyScope/.test(routes)) {
    errors.push("backend: detail handler must use withCompanyScope (entity RLS)");
  }
  if (!/`\/accounting\/expenses\/\$\{id\}`/.test(entityLink)) {
    errors.push("EntityLink: expense must resolve to /accounting/expenses/${id}");
  }
  if (!/path=["']\/accounting\/expenses\/:id["']/.test(manifest)) {
    errors.push("manifest: must mount /accounting/expenses/:id");
  }
  if (!/ExpenseDetailPage/.test(manifest)) {
    errors.push("manifest: ExpenseDetailPage must be wired");
  }
  if (!/export function ExpenseDetailPage/.test(detailPage)) {
    errors.push("ExpenseDetailPage: exported component missing");
  }
  for (const needle of [
    'kind="vendor"',
    'kind="journal_entry"',
    'kind="load"',
    'kind="unit"',
    "chart-of-accounts/register",
  ]) {
    if (!detailPage.includes(needle)) {
      errors.push(`ExpenseDetailPage: must render clickable link for ${needle}`);
    }
  }
  if (!/export function getExpense\(/.test(api)) {
    errors.push("api/accounting.ts: getExpense client missing");
  }
  return errors;
}

function selftest() {
  const errors = assertExpenseDetailRoute();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED — live sources rejected: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertExpenseDetailRoute();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
