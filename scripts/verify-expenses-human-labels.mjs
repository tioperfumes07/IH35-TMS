#!/usr/bin/env node
/** ACCT-F5738 — visible expense rows must not use entityLabel tombstones for their own #. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIST = "apps/frontend/src/pages/accounting/ExpensesListPage.tsx";
const DETAIL = "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx";
const LABEL = "verify-expenses-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assert(list, detail) {
  const problems = [];
  if (/expense_number\s*\|\|\s*r\.id\.slice\(0,\s*8\)/.test(list) || /expense_number\s*\?\?\s*r\.id\.slice/.test(list)) {
    problems.push(`${LIST}: expense column still UUID-slices`);
  }
  if (/highlightedExpenseId\.slice\(0,\s*8\)/.test(list)) {
    problems.push(`${LIST}: deep-link header still UUID-slices`);
  }
  if (!/expenseListLabel\(r\.expense_number\)/.test(list) || !/No expense #/.test(list)) {
    problems.push(`${LIST}: must use expenseListLabel / No expense # for visible rows`);
  }
  if (/entityLabel\(r\.expense_number,\s*r\.id,\s*"Expense"\)/.test(list)) {
    problems.push(`${LIST}: must not tombstone visible expense #`);
  }
  if (!/humanMemo\(/.test(list)) {
    problems.push(`${LIST}: JE column must humanMemo UUID posting memos`);
  }
  if (/expense\.id\.slice\(0,\s*8\)/.test(detail) || /expense_number\s*\?\?\s*expense\.id\.slice/.test(detail)) {
    problems.push(`${DETAIL}: displayId still UUID-slices`);
  }
  if (/return id\.slice\(0,\s*8\)/.test(detail)) {
    problems.push(`${DETAIL}: accountLabel still returns id.slice`);
  }
  if (!/expenseListLabel\(expense\.expense_number\)/.test(detail)) {
    problems.push(`${DETAIL}: must use expenseListLabel for displayId`);
  }
  return problems;
}

if (SELFTEST) {
  const list = fs.readFileSync(path.join(ROOT, LIST), "utf8");
  const detail = fs.readFileSync(path.join(ROOT, DETAIL), "utf8");
  const plantedList = list.replace(/expenseListLabel\(r\.expense_number\)/, "r.expense_number || r.id.slice(0, 8)");
  const plantedDetail = detail.replace(/expenseListLabel\(expense\.expense_number\)/, "expense.expense_number ?? expense.id.slice(0, 8)");
  if (!assert(plantedList, plantedDetail).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const liveProblems = assert(list, detail);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${liveProblems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(
  fs.readFileSync(path.join(ROOT, LIST), "utf8"),
  fs.readFileSync(path.join(ROOT, DETAIL), "utf8"),
);
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
