#!/usr/bin/env node
/**
 * M-21 — Maintenance Home + Create Bill/Expense must require WO linkage pickers.
 * Cursor even claim: 2390.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maint-home-bill-expense-wo-link";
const SELFTEST = process.argv.includes("--selftest");

const HOME = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const BILL = "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx";
const EXPENSE = "apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx";

export function collectProblems(files) {
  const problems = [];
  const home = files[HOME] ?? "";
  const bill = files[BILL] ?? "";
  const expense = files[EXPENSE] ?? "";

  if (!/CreateBillModal[\s\S]*?requireWoLink/.test(home.replace(/\n/g, " "))) {
    problems.push(`${HOME}: CreateBillModal from header must pass requireWoLink`);
  }
  if (!/CreateExpenseModal[\s\S]*?requireWoLink/.test(home.replace(/\n/g, " "))) {
    problems.push(`${HOME}: CreateExpenseModal from header must pass requireWoLink`);
  }
  if (!/maint-bill-wo-link-pickers/.test(bill) || !/kind=["']work_order["']/.test(bill)) {
    problems.push(`${BILL}: must render WO EntityPicker when requireWoLink`);
  }
  if (!/maint-expense-wo-link-pickers/.test(expense) || !/kind=["']work_order["']/.test(expense)) {
    problems.push(`${EXPENSE}: must render WO EntityPicker when requireWoLink`);
  }
  if (!/requireWoLink/.test(bill) || !/requireWoLink/.test(expense)) {
    problems.push("CreateBillModal/CreateExpenseModal must accept requireWoLink prop");
  }
  return problems;
}

if (SELFTEST) {
  const bad = {
    [HOME]: "<CreateBillModal open />\n<CreateExpenseModal open />",
    [BILL]: "export function CreateBillModal() { return <VendorBillForm /> }",
    [EXPENSE]: "export function CreateExpenseModal() { return <RecordExpenseForm /> }",
  };
  const good = {
    [HOME]: "<CreateBillModal requireWoLink />\n<CreateExpenseModal requireWoLink />",
    [BILL]: 'requireWoLink\ndata-testid="maint-bill-wo-link-pickers"\nkind="work_order"',
    [EXPENSE]: 'requireWoLink\ndata-testid="maint-expense-wo-link-pickers"\nkind="work_order"',
  };
  if (collectProblems(bad).length < 2 || collectProblems(good).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: collectProblems(bad), good: collectProblems(good) });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const files = Object.fromEntries(
  [HOME, BILL, EXPENSE].map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), "utf8")])
);
const problems = collectProblems(files);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Maintenance Home bill/expense require WO link pickers`);
