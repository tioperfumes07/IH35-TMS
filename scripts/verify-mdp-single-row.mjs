#!/usr/bin/env node
// MDP-SINGLE-ROW guard — the Manual Daily Projections tab uses ONE projection date (no From/To
// range), renders income/expense as single horizontal rows with the 3 named fields, keeps the
// totals math (#1084), and leaves Actual vs Projected as its own separate tab.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-mdp-single-row: ${m}`);
  process.exit(1);
};

const mdp = read("apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx");

// 1. Single projection date — present, and the From/To range is gone.
if (!mdp.includes('data-mdp-single-date="true"')) fail("MDP must have the single projection-date control");
if (!mdp.includes("projectionDate")) fail("MDP must use a single projectionDate");
if (/const \[from, setFrom\]|const \[to, setTo\]/.test(mdp)) fail("MDP must NOT keep the From/To range state");

// 2. Income row (MDP-FIX-2 / defect 4) = Unit no. · Invoice · Customer · Total. Invoice and Customer
//    are now SEPARATE columns (was the merged "Invoice customer"). Authoritative column-order check lives
//    in verify-mdp-fields; here we keep the label lock aligned to the new Jorge-confirmed structure.
for (const label of ['"Unit no."', '"Invoice"', '"Customer"']) {
  if (!mdp.includes(label)) fail(`income row must label ${label}`);
}
if (/"Invoice customer"/.test(mdp)) fail('income must NOT use the merged "Invoice customer" field (split into Invoice + Customer)');
// 3. Expense row (defect 5) = Bill/Exp No. · Vendor/Driver · Expense · Total — Bill/Exp No. leads.
for (const label of ['"Bill/Exp No."', '"Vendor/Driver"', '"Expense"']) {
  if (!mdp.includes(label)) fail(`expense row must label ${label}`);
}
if (!mdp.includes('ariaLabel="Total"') && !mdp.includes('"Total"')) fail("rows must have a Total field");

// 4. Totals math (#1084) untouched — still computed via the shared helper.
if (!mdp.includes("computeProjectionTotals")) fail("MDP must keep computeProjectionTotals (#1084 summing)");

// 5. Actual vs Projected stays a SEPARATE tab; MDP does not embed it.
if (/ActualVsProjected/.test(mdp)) fail("MDP must NOT embed the Actual vs Projected tab");
const page = read("apps/frontend/src/pages/cash-flow/CashFlowPage.tsx");
if (!page.includes("ActualVsProjectedTab") || !page.includes('"actual_vs_projected"')) {
  fail("Actual vs Projected must remain its own cash-flow tab");
}

console.log("PASS verify-mdp-single-row");
