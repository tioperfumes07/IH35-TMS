#!/usr/bin/env node
// MDP-FIX-2 guard: Manual Daily Projections field structure + summed totals (Jorge-confirmed).
//  - income row: Unit no.(ref_label) · Invoice(invoice_no) · Customer(party_name) — Invoice & Customer
//    are SEPARATE columns (defect 4), not one merged "Invoice customer" field.
//  - expense row: Bill/Exp No.(invoice_no) FIRST · Vendor/Driver(party_name) · Expense(category) (defect 5).
//  - BOTH panels render a summed Total (header + footer) via sumCents (defect 1).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-mdp-fields: ${m}`); process.exit(1); };
const tab = readFileSync(join(root, "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx"), "utf8");

// Income columns in order: ref_label (Unit no.), invoice_no (Invoice), party_name (Customer).
if (!/income:\s*\[\s*\{\s*key:\s*"ref_label"[\s\S]*?\{\s*key:\s*"invoice_no",\s*label:\s*"Invoice"[\s\S]*?\{\s*key:\s*"party_name",\s*label:\s*"Customer"/.test(tab)) {
  fail("income must have SEPARATE columns: Unit no. -> Invoice(invoice_no) -> Customer(party_name)");
}
if (/"Invoice customer"/.test(tab)) fail("income must NOT use the merged 'Invoice customer' field (split into Invoice + Customer)");

// Expense columns in order: invoice_no (Bill/Exp No.) FIRST, party_name (Vendor/Driver), category (Expense).
if (!/expense:\s*\[\s*\{\s*key:\s*"invoice_no",\s*label:\s*"Bill\/Exp No\."[\s\S]*?\{\s*key:\s*"party_name",\s*label:\s*"Vendor\/Driver"[\s\S]*?\{\s*key:\s*"category",\s*label:\s*"Expense"/.test(tab)) {
  fail("expense must lead with Bill/Exp No.(invoice_no), then Vendor/Driver(party_name), then Expense(category)");
}

// Both panels sum a Total (footer) — defect 1.
if (!/data-mdp-footer-total=\{direction\}/.test(tab)) fail("each panel must render a summed Total footer (data-mdp-footer-total)");
if (!/const total = sumCents\(entries\)/.test(tab)) fail("panel total must use sumCents(entries) (integer-cents summing, #1084)");

// Net + KPI totals use computeProjectionTotals (income/expense/net all recompute).
if (!/computeProjectionTotals\(entries\)/.test(tab)) fail("tab must compute income/expense/net via computeProjectionTotals");
console.log("PASS verify-mdp-fields");
