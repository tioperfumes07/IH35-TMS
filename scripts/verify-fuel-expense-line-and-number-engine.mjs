#!/usr/bin/env node
// R-178 guard — (1) the fuel expense engine's line 1 carries quantity/rate_cents/unit_of_measure, which
// expense_lines_item_qty_rate_amount_check requires whenever item_id is set (without them every fuel
// expense create refused, measured 09-25); (2) generateExpenseNumber skips numbers already taken instead of
// colliding with uq_accounting_expenses_company_expense_number. Static + selftest.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fuel = readFileSync(path.join(ROOT, "apps/backend/src/fuel/fuel-expense-document.service.ts"), "utf8");
const num = readFileSync(path.join(ROOT, "apps/backend/src/expense-attribution/expense-number.ts"), "utf8");
const fails = [];
const ins = fuel.match(/INSERT INTO accounting\.expense_lines \(([\s\S]*?)\)/g) ?? [];
for (const i of ins) {
  if (/\bitem_id\b/.test(i) && !(/\bquantity\b/.test(i) && /\brate_cents\b/.test(i) && /\bunit_of_measure\b/.test(i)))
    fails.push("fuel-expense-document expense_lines insert sets item_id without quantity/rate_cents/unit_of_measure");
}
if (!ins.length) fails.push("no expense_lines insert found in fuel-expense-document.service.ts");
if (!/expense_attribution\.expense_load_links WHERE operating_company_id = \$1::uuid AND expense_number = \$2/.test(num)) fails.push("generateExpenseNumber no longer checks taken numbers");
// selftest
const bad = "INSERT INTO accounting.expense_lines (a, item_id)";
if (!(/\bitem_id\b/.test(bad) && !/\bquantity\b/.test(bad))) fails.push("selftest broken");
if (fails.length) { console.error(`verify-fuel-expense-line-and-number-engine: FAIL — ${fails.join("; ")}`); process.exit(1); }
console.log(`verify-fuel-expense-line-and-number-engine: PASS — ${ins.length} expense_lines insert(s) carry qty/rate/uom with item_id; expense numbering skips taken numbers.`);
