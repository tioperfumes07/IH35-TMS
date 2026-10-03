#!/usr/bin/env node
// U5 (owner UI register 2026-10-03) — "the receipt creator must BE the expense creator, one writer". Static.
//   1. Accounting > Receipts creates through the expense creator only (RecordExpenseModal -> RecordExpenseForm ->
//      POST /api/v1/expenses), with the attached file filed as a receipt
//   2. the receipts backend stays read-only — no INSERT / UPDATE / DELETE, no POST / PUT / PATCH route
//   3. the expense form files the upload under the category it is given (receipt from Receipts)
import { readFileSync } from "node:fs";

const LABEL = "verify-receipt-creator-is-expense-creator";
const fails = [];
const read = (p) => readFileSync(p, "utf8");

const page = read("apps/frontend/src/pages/accounting/ReceiptsPage.tsx");
if (!/<RecordExpenseModal\b[\s\S]{0,400}attachmentCategory="receipt"/.test(page)) fails.push("Receipts no longer opens the expense creator with attachmentCategory=\"receipt\"");
if (!page.includes('data-testid="receipts-new"')) fails.push("Receipts lost its New receipt action");
if (/\b(createExpense|apiRequest|fetch)\(/.test(page)) fails.push("Receipts writes on its own — it must create only through RecordExpenseModal");

const routes = read("apps/backend/src/accounting/receipts.routes.ts");
if (/\b(INSERT\s+INTO|UPDATE\s+[a-z_]+\.[a-z_]+\s+SET|DELETE\s+FROM)\b/i.test(routes)) fails.push("receipts.routes.ts writes — a receipt is created by the expense writer, never here");
if (/app\.(post|put|patch|delete)\(/.test(routes)) fails.push("receipts.routes.ts gained a write route");

const form = read("apps/frontend/src/components/expenses/RecordExpenseForm.tsx");
if (!/defaultCategory=\{attachmentCategory\}/.test(form)) fails.push("RecordExpenseForm no longer files the upload under the given category");
const modal = read("apps/frontend/src/components/expenses/RecordExpenseModal.tsx");
if (!/attachmentCategory=\{attachmentCategory\}/.test(modal)) fails.push("RecordExpenseModal no longer passes the attachment category to the form");

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — New receipt opens the one expense creator (POST /api/v1/expenses), filed as a receipt; receipts backend is read-only`);
