#!/usr/bin/env node
/**
 * Spec 09-04-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL.md §1.2: "/cost of goods/i has spaces.
 * The account type is CostOfGoodsSold -- no spaces. It never matches. Ten cost accounts never reach
 * the Category dropdown." Guards that the Costs tab's category filter matches the account-type SET
 * exactly (Expense, OtherExpense, CostOfGoodsSold), never a free-text regex against the QBO type
 * string that a real enum spelling can silently fail to match.
 */
import fs from "node:fs";

const PATH = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";

function violations(src) {
  const errors = [];
  if (/\/expense\|cost of goods\/i/.test(src)) errors.push("the stale 'cost of goods' (with spaces) regex is back -- it never matches the real 'CostOfGoodsSold' account_type spelling");
  if (!src.includes('row.account_type === "Expense"') || !src.includes('row.account_type === "OtherExpense"') || !src.includes('row.account_type === "CostOfGoodsSold"')) {
    errors.push("categories filter does not match the account-type SET exactly (Expense/OtherExpense/CostOfGoodsSold)");
  }
  return errors;
}

function check(src) {
  const errors = violations(src);
  if (errors.length) throw new Error(errors.join("; "));
}

const src = fs.readFileSync(PATH, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    src.replace('row.account_type === "Expense" || row.account_type === "OtherExpense" || row.account_type === "CostOfGoodsSold"', '/expense|cost of goods/i.test(row.account_type)'),
    src.replace('row.account_type === "CostOfGoodsSold"', "false"),
  ];
  for (const [index, mutated] of mutations.entries()) {
    try { check(mutated); }
    catch { caught += 1; continue; }
    throw new Error(`mutation ${index + 1} escaped detection`);
  }
  check(src);
  console.log(`PASS verify-cost-category-picker-includes-cogs --selftest (${caught}/${mutations.length})`);
} else {
  check(src);
  console.log("PASS verify-cost-category-picker-includes-cogs (Expense/OtherExpense/CostOfGoodsSold all reach the Category dropdown)");
}
