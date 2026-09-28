#!/usr/bin/env node
// verify-universal-reinstate-engine.mjs — R-191 item 2.
// Asserts the universal unvoid / reinstate engine exists as the counterpart to voidDocument:
//   - reinstateDocument dispatcher covers every voidDocument type that is wired for reinstate
//   - stampDocumentReinstated writes reinstated_* for bills/bill_payments/payments/credit_memos/
//     prepaid (parity with the columns that already exist live)
//   - /unvoid routes sit beside /void for bills, bill_payments, expenses, invoices, payments,
//     credit_memos, prepaid
//   - factoring_advance reinstate is REFUSED by default (AUTH-113 hard line)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-universal-reinstate-engine";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mustInclude(file, needle, why) {
  const src = read(file);
  if (!src.includes(needle)) {
    console.error(`${LABEL}: FAIL — ${file} missing ${JSON.stringify(needle)} (${why})`);
    process.exit(1);
  }
}

function mustMatch(file, re, why) {
  const src = read(file);
  if (!re.test(src)) {
    console.error(`${LABEL}: FAIL — ${file} missing /${re.source}/ (${why})`);
    process.exit(1);
  }
}

const STAMP = "apps/backend/src/accounting/void-document-stamp.service.ts";
const REINSTATE = "apps/backend/src/accounting/reinstate-document.service.ts";
const VOID_DOC = "apps/backend/src/accounting/void-document.service.ts";

mustInclude(STAMP, "REINSTATE_DOCUMENT_FAMILIES", "reinstate family list");
mustInclude(STAMP, '"bill"', "bill family in reinstate map");
mustInclude(STAMP, '"bill_payment"', "bill_payment family in reinstate map");
mustInclude(STAMP, '"customer_payment"', "customer_payment family in reinstate map");
mustInclude(STAMP, '"credit_memo"', "credit_memo family in reinstate map");
mustInclude(STAMP, '"prepaid_purchase"', "prepaid_purchase family in reinstate map");
mustInclude(STAMP, "reinstated_at = now()", "writes reinstated_at");
mustInclude(STAMP, "reinstate_reason = $3", "writes reinstate_reason");
mustInclude(STAMP, "reinstated_by_user_id = $4", "writes reinstated_by_user_id");
mustInclude(STAMP, "reinstated_from_void_je_id = $5", "writes reinstated_from_void_je_id");
mustInclude(STAMP, "revoked_at = NULL", "clears revoked_* on bill families");

mustInclude(REINSTATE, "export async function reinstateDocument", "dispatcher export");
mustInclude(REINSTATE, "export async function reinstateDocumentThenVoidReversal", "wrapper that voids reversing JE");
mustInclude(REINSTATE, 'case "bill"', "bill case");
mustInclude(REINSTATE, 'case "bill_payment"', "bill_payment case");
mustInclude(REINSTATE, 'case "expense"', "expense case");
mustInclude(REINSTATE, 'case "invoice"', "invoice case");
mustInclude(REINSTATE, 'case "customer_payment"', "customer_payment case");
mustInclude(REINSTATE, 'case "credit_memo"', "credit_memo case");
mustInclude(REINSTATE, 'case "prepaid_purchase"', "prepaid_purchase case");
mustInclude(REINSTATE, "factoring_reinstate_requires_auth", "AUTH-113 refuse factoring by default");
mustInclude(REINSTATE, "findVoidReversalJournalEntryId", "reversing-JE lookup (no memo parsing)");
mustInclude(REINSTATE, "voidJournalEntry", "Option-1 void of reversing JE");

mustInclude(VOID_DOC, "export async function voidDocument", "void counterpart still present");

const UNVOID_ROUTES = [
  ["apps/backend/src/accounting/bills.routes.ts", "/api/v1/accounting/bills/:id/unvoid"],
  ["apps/backend/src/accounting/bills.routes.ts", "/api/v1/accounting/bill-payments/:id/unvoid"],
  ["apps/backend/src/accounting/expenses.routes.ts", "/api/v1/expenses/:expenseId/unvoid"],
  ["apps/backend/src/accounting/invoices.routes.ts", "/api/v1/accounting/invoices/:id/unvoid"],
  ["apps/backend/src/accounting/payments.routes.ts", "/api/v1/accounting/payments/:id/unvoid"],
  ["apps/backend/src/accounting/credit-memos.routes.ts", "/api/v1/accounting/credit-memos/:id/unvoid"],
  ["apps/backend/src/accounting/prepaid-expenses.routes.ts", "/api/v1/accounting/prepaid-expenses/:id/unvoid"],
];

for (const [file, route] of UNVOID_ROUTES) {
  mustInclude(file, route, `unvoid route ${route}`);
  mustInclude(file, "reinstateDocumentThenVoidReversal", `wires reinstateDocumentThenVoidReversal on ${route}`);
}

// voidBill must write voided_* (parity with bill_payments) so reinstate can clear both.
mustMatch(
  "apps/backend/src/accounting/bills.service.ts",
  /voided_at\s*=\s*now\(\)/,
  "voidBill writes voided_at alongside revoked_at"
);

function selftest() {
  const reinstate = read(REINSTATE);
  if (!reinstate.includes("factoring_reinstate_requires_auth")) {
    throw new Error("AUTH-113 refuse missing");
  }
  if (!reinstate.includes("export async function reinstateDocument")) {
    throw new Error("reinstateDocument export missing");
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`${LABEL} --selftest FAIL:`, e.message ?? e);
    process.exit(1);
  }
  process.exit(0);
}

console.log(`${LABEL}: OK — reinstateDocument + stampDocumentReinstated parity + /unvoid routes wired.`);
