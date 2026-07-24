#!/usr/bin/env node
/**
 * Guard: QBO Item pull must map ExpenseAccountRef → catalogs.items.default_expense_account_id.
 *
 * Without this, ItemBased AP bill_lines project with account_id NULL even when QBO Item
 * already declares an expense account (Neon: 0/189 items had default_expense_account_id).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-item-expense-account-map";
const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const puller = read("apps/backend/src/qbo-sync/items-puller.ts");
const backfill = read("scripts/ops/backfill-qbo-item-expense-accounts.mjs");

if (!/resolveDefaultExpenseAccountId/.test(puller)) {
  failures.push("items-puller must export/resolveDefaultExpenseAccountId from ExpenseAccountRef");
}
if (!/default_expense_account_id/.test(puller)) {
  failures.push("items-puller upsert must write default_expense_account_id");
}
if (!/ExpenseAccountRef/.test(puller)) {
  failures.push("items-puller must read QBO ExpenseAccountRef");
}
if (!/qbo_account_id/.test(puller)) {
  failures.push("items-puller must map via catalogs.accounts.qbo_account_id (no invent)");
}
if (!/default_expense_account_id/.test(backfill) || !/ExpenseAccountRef/.test(backfill)) {
  failures.push("owner backfill must set default_expense_account_id from qbo_items ExpenseAccountRef");
}
if (/INSERT INTO catalogs\.accounts/.test(puller)) {
  failures.push("must not invent CoA rows during item expense mapping");
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (QBO Item ExpenseAccountRef → default_expense_account_id)`);
