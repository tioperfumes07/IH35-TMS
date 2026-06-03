#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targets = [
  path.join(repoRoot, "apps/frontend/src/pages/home/QuickActionsBar.tsx"),
  path.join(repoRoot, "apps/frontend/src/pages/home/HomeOffice.tsx"),
];

function fail(message) {
  console.error(`verify:home-record-expense-modal FAIL\n- ${message}`);
  process.exit(1);
}

function extractRecordExpenseHandler(source) {
  const buttonMatch = source.match(
    /onClick=\{\(\)\s*=>\s*\{([\s\S]{0,400}?)\}\s*\}[\s\S]{0,400}?\+ Record Expense/
  );
  if (!buttonMatch) {
    return null;
  }
  return buttonMatch[1];
}

let scanned = false;
for (const filePath of targets) {
  if (!fs.existsSync(filePath)) {
    continue;
  }
  scanned = true;
  const source = fs.readFileSync(filePath, "utf8");
  const handler = extractRecordExpenseHandler(source);
  if (!handler) {
    fail(`${path.relative(repoRoot, filePath)}: could not locate + Record Expense quick-action handler`);
  }
  if (/navigate\(\s*['"]\/accounting\/expenses['"]\s*\)/.test(handler)) {
    fail(`${path.relative(repoRoot, filePath)}: Record Expense quick action must open modal, not navigate to /accounting/expenses`);
  }
  if (!/setExpenseOpen\(true\)|setShowRecordExpenseModal\(true\)/.test(handler)) {
    fail(`${path.relative(repoRoot, filePath)}: Record Expense quick action must open the record expense modal`);
  }
}

if (!scanned) {
  fail("no home quick-action source file found (QuickActionsBar.tsx or HomeOffice.tsx)");
}

console.log("verify:home-record-expense-modal PASS");
