#!/usr/bin/env node
/**
 * verify-acct-expense-list-reverse — Law §9 expense list reverse drill (18/22).
 *
 * Root cause: GET /api/v1/expenses list omitted journal_entry_id; ExpensesListPage had no
 * dedicated Vendor/JE EntityLink columns for reverse drill-through from the browse grid.
 *
 * Fix: list SELECT exposes journal_entry_id from accounting.expenses; list row type + UI columns
 * wire EntityLink kind=vendor (vendor_uuid) and kind=journal_entry (journal_entry_id). No GL math.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-expense-list-reverse";

const LIST_PAGE = "apps/frontend/src/pages/accounting/ExpensesListPage.tsx";
const API = "apps/frontend/src/api/accounting.ts";
const ROUTES = "apps/backend/src/accounting/expenses.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure checks — injectable for --selftest. */
export function check({ listPage, api, routes }) {
  const errors = [];

  if (!routes) {
    errors.push(`${ROUTES}: missing`);
  } else {
    if (!/journal_entry_id::text\s+AS journal_entry_id/.test(routes)) {
      errors.push(`${ROUTES}: list query must SELECT journal_entry_id`);
    }
    if (!/export type ExpenseListRow[\s\S]*journal_entry_id:\s*string \| null/.test(routes)) {
      errors.push(`${ROUTES}: ExpenseListRow must include journal_entry_id`);
    }
  }

  if (!api) {
    errors.push(`${API}: missing`);
  } else if (!/export type ExpenseListRow[\s\S]*journal_entry_id:\s*string \| null/.test(api)) {
    errors.push(`${API}: ExpenseListRow must include journal_entry_id`);
  }

  if (!listPage) {
    errors.push(`${LIST_PAGE}: missing`);
  } else {
    if (!listPage.includes('label: "Vendor"') || !/kind="vendor"/.test(listPage) || !/vendor_uuid/.test(listPage)) {
      errors.push(`${LIST_PAGE}: must render Vendor column with EntityLink kind=vendor on vendor_uuid`);
    }
    if (!listPage.includes('label: "JE"') || !/kind="journal_entry"/.test(listPage) || !/journal_entry_id/.test(listPage)) {
      errors.push(`${LIST_PAGE}: must render JE column with EntityLink kind=journal_entry on journal_entry_id`);
    }
  }

  return errors;
}

function selftest() {
  const goodList = `
    { key: "vendor_uuid", label: "Vendor", render: (r) => <EntityLink kind="vendor" id={r.vendor_uuid} /> }
    { key: "journal_entry_id", label: "JE", render: (r) => <EntityLink kind="journal_entry" id={r.journal_entry_id} /> }
  `;
  const goodApi = `export type ExpenseListRow = { journal_entry_id: string | null; vendor_uuid: string | null; };`;
  const goodRoutes = `
    export type ExpenseListRow = { journal_entry_id: string | null; };
    e.journal_entry_id::text AS journal_entry_id
  `;
  const errors = check({ listPage: goodList, api: goodApi, routes: goodRoutes });
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED: ${errors.join("; ")}`);
    process.exit(1);
  }
  const liveErrors = check({
    listPage: read(LIST_PAGE),
    api: read(API),
    routes: read(ROUTES),
  });
  if (liveErrors.length) {
    console.error(`${LABEL} SELFTEST FAILED — live sources rejected: ${liveErrors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check({
  listPage: read(LIST_PAGE),
  api: read(API),
  routes: read(ROUTES),
});

if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log(`${LABEL} PASS`);
