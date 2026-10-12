#!/usr/bin/env node
// R-178 guard — (1) the fuel expense engine's line 1 carries quantity/rate_cents/unit_of_measure, which
// expense_lines_item_qty_rate_amount_check requires whenever item_id is set (without them every fuel
// expense create refused, measured 09-25); (2) generateExpenseNumber skips numbers already taken instead of
// colliding with uq_accounting_expenses_company_expense_number. Static + selftest.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-expense-line-and-number-engine";

/** Pure: the failures for the fuel-expense-document source + the expense-number source. */
export function check(fuel, num) {
  const fails = [];
  const ins = fuel.match(/INSERT INTO accounting\.expense_lines \(([\s\S]*?)\)/g) ?? [];
  for (const i of ins) {
    if (/\bitem_id\b/.test(i) && !(/\bquantity\b/.test(i) && /\brate_cents\b/.test(i) && /\bunit_of_measure\b/.test(i)))
      fails.push("fuel-expense-document expense_lines insert sets item_id without quantity/rate_cents/unit_of_measure");
  }
  if (/1, \$4, 'each'\)/.test(fuel)) fails.push("expense_lines insert reuses an uncast $4 for amount_cents and rate_cents (inconsistent types deduced for parameter $4)");
  if (!ins.length) fails.push("no expense_lines insert found in fuel-expense-document.service.ts");
  if (!/expense_attribution\.expense_load_links WHERE operating_company_id = \$1::uuid AND expense_number = \$2/.test(num)) fails.push("generateExpenseNumber no longer checks taken numbers");
  return { fails, inserts: ins.length };
}

const fuel = readFileSync(path.join(ROOT, "apps/backend/src/fuel/fuel-expense-document.service.ts"), "utf8");
const num = readFileSync(path.join(ROOT, "apps/backend/src/expense-attribution/expense-number.ts"), "utf8");

if (process.argv.includes("--selftest")) {
  const goodNum = "SELECT 1 FROM expense_attribution.expense_load_links WHERE operating_company_id = $1::uuid AND expense_number = $2";
  const goodFuel = "INSERT INTO accounting.expense_lines (expense_id, item_id, quantity, rate_cents, unit_of_measure) VALUES (...)";
  const cases = [
    ["the real sources pass", check(fuel, num).fails.length === 0],
    ["a planted line with item_id and qty/rate/uom passes", check(goodFuel, goodNum).fails.length === 0],
    ["item_id without quantity/rate/uom fails", check("INSERT INTO accounting.expense_lines (expense_id, item_id)", goodNum).fails.some((f) => f.includes("without quantity"))],
    ["an uncast reused $4 fails", check(`${goodFuel} VALUES (1, $4, 'each')`, goodNum).fails.some((f) => f.includes("uncast $4"))],
    ["no expense_lines insert fails", check("nothing here", goodNum).fails.some((f) => f.includes("no expense_lines insert"))],
    ["a numberer that no longer checks taken numbers fails", check(goodFuel, "return next;").fails.some((f) => f.includes("taken numbers"))],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { fails, inserts } = check(fuel, num);
if (fails.length) { console.error(`${LABEL}: FAIL — ${fails.join("; ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — ${inserts} expense_lines insert(s) carry qty/rate/uom with item_id; expense numbering skips taken numbers.`);
