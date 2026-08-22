#!/usr/bin/env node
/**
 * ACCT-F17 — Expense → bank reverse drill (Law §9 twin of Receive Payment bank reverse).
 *
 * match.service stamps banking.bank_transactions.matched_expense_id on accept.
 * Expenses list/detail must project matched_bank_transaction_id and EntityLink it.
 *
 * Usage:
 *   node scripts/verify-expense-bank-reverse-links.mjs
 *   node scripts/verify-expense-bank-reverse-links.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-bank-reverse-links";

const ROUTES = "apps/backend/src/accounting/expenses.routes.ts";
const API = "apps/frontend/src/api/accounting.ts";
const DETAIL = "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx";
const LIST = "apps/frontend/src/pages/accounting/ExpensesListPage.tsx";

/** @param {Record<string, string | null>} files */
export function check(files) {
  const f = [];
  const routes = files[ROUTES] ?? "";
  if (!/matched_expense_id/.test(routes) || !/matched_bank_transaction_id/.test(routes)) {
    f.push(`${ROUTES}: must project matched_bank_transaction_id via matched_expense_id`);
  }
  if (!/EXPENSE_MATCHED_BANK_TRANSACTION_ID_SQL|bt\.matched_expense_id\s*=\s*e\.id/.test(routes)) {
    f.push(`${ROUTES}: missing EXPENSE_MATCHED_BANK subquery (or equivalent)`);
  }

  if (!/EXPENSE_MATCHED_BANK_TRANSACTION_LABEL_SQL/.test(routes) || !/matched_bank_transaction_description/.test(routes)) {
    f.push(`${ROUTES}: must project matched_bank_transaction_description beside the id hop`);
  }

  const api = files[API] ?? "";
  if (!/matched_bank_transaction_id/.test(api)) {
    f.push(`${API}: ExpenseListRow/ExpenseDetail must declare matched_bank_transaction_id`);
  }

  const detail = files[DETAIL] ?? "";
  if (!/matched_bank_transaction_id/.test(detail) || !/kind=["']bank_transaction["']/.test(detail)) {
    f.push(`${DETAIL}: must EntityLink kind=bank_transaction from matched_bank_transaction_id`);
  }

  const list = files[LIST] ?? "";
  if (!/matched_bank_transaction_id/.test(list) || !/kind=["']bank_transaction["']/.test(list)) {
    f.push(`${LIST}: must EntityLink bank_transaction column from matched_bank_transaction_id`);
  }
  if (/entityLabel\(\s*null\s*,\s*r\.matched_bank_transaction_id/.test(list)) {
    f.push(`${LIST}: must not entityLabel(null, matched_bank_transaction_id) — use description`);
  }

  return f;
}

export function run(root = ROOT) {
  /** @type {Record<string, string | null>} */
  const files = {};
  for (const rel of [ROUTES, API, DETAIL, LIST]) {
    try {
      files[rel] = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      files[rel] = null;
    }
  }
  return check(files);
}

if (process.argv.includes("--selftest")) {
  const good = {
    [ROUTES]: `const EXPENSE_MATCHED_BANK_TRANSACTION_ID_SQL = \`SELECT bt.id WHERE bt.matched_expense_id = e.id\`;
      const EXPENSE_MATCHED_BANK_TRANSACTION_LABEL_SQL = \`SELECT bt.merchant_name\`;
      AS matched_bank_transaction_id AS matched_bank_transaction_description`,
    [API]: `matched_bank_transaction_id?: string | null;`,
    [DETAIL]: `<EntityLink kind="bank_transaction" id={expense.matched_bank_transaction_id} />`,
    [LIST]: `key: "matched_bank_transaction_id", render: (r) => <EntityLink kind="bank_transaction" id={r.matched_bank_transaction_id} label={entityLabel(r.matched_bank_transaction_description, r.matched_bank_transaction_id, "Bank transaction")} />`,
  };
  if (check(good).length) throw new Error(`${LABEL} PASS path failed: ${check(good).join("; ")}`);
  const bad = { ...good, [DETAIL]: `<div>no bank</div>` };
  if (!check(bad).length) throw new Error(`${LABEL} FAIL path did not catch missing detail EntityLink`);
  const tombstone = {
    ...good,
    [LIST]: `key: "matched_bank_transaction_id", render: (r) => <EntityLink kind="bank_transaction" id={r.matched_bank_transaction_id} label={entityLabel(null, r.matched_bank_transaction_id, "Bank transaction")} />`,
  };
  if (!check(tombstone).length) throw new Error(`${LABEL} FAIL path did not catch UUID tombstone Bank label`);
  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
