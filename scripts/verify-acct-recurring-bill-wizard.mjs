#!/usr/bin/env node
/**
 * Guard: Recurring Bill create wizard depth (Accounting 9/M).
 * Line items must pick catalogs.accounts via ReferenceSelect createKind=account (coa_account_id),
 * and generation must pass those lines into createBill.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

const createPage = fs.readFileSync(
  path.join(root, "apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx"),
  "utf8"
);
const api = fs.readFileSync(path.join(root, "apps/frontend/src/api/accounting.ts"), "utf8");
const generator = fs.readFileSync(
  path.join(root, "apps/backend/src/accounting/bills/recurring/generator.service.ts"),
  "utf8"
);

if (!createPage.includes('createKind="account"')) fail("RecurringBillCreate line CoA must use createKind=account");
if (!createPage.includes("coa_account_id")) fail("RecurringBillCreate must bind coa_account_id on lines");
if (!createPage.includes("recurring-bill-line-items")) fail("line items testid missing");
if (!createPage.includes("SelectCombobox")) fail("Frequency must use SelectCombobox (not bare native-only chrome)");
if (!createPage.includes("getCoaAccounts")) fail("Must load entity-scoped CoA for line pickers");

if (!api.includes("coa_account_id?: string | null")) {
  fail("FE RecurringBillLineItem must use coa_account_id (matches backend)");
}
const lineTypeMatch = api.match(/export type RecurringBillLineItem = \{[\s\S]*?\n\};/);
if (!lineTypeMatch) fail("RecurringBillLineItem type block not found");
if (/(^|\n)\s*account_id\?:/.test(lineTypeMatch[0])) {
  fail("FE RecurringBillLineItem must not use legacy account_id field name");
}

if (!generator.includes("billLines") || !generator.includes("lines: billLines")) {
  fail("generator must pass template line_items into createBill({ lines })");
}
if (!generator.includes("recurring_bill_line_coa_required")) {
  fail("generator must fail closed when line items lack coa_account_id");
}

console.log("PASS: verify-acct-recurring-bill-wizard");
