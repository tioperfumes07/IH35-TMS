#!/usr/bin/env node
/**
 * Rule-17 guard: invoice reverse surfaces stay wired (register → invoice, customer EntityLink, JE reverse).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-reverse-routes";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertInvoiceReverseRoutes() {
  const errors = [];
  const register = read("apps/frontend/src/pages/accounting/AccountRegisterPage.tsx");
  const customer = read("apps/frontend/src/pages/CustomerDetail.tsx");
  const jeDetail = read("apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx");
  const invoiceDetail = read("apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx");
  const paymentDetail = read("apps/frontend/src/pages/accounting/PaymentDetailPage.tsx");

  if (!/t === ["']invoice["'] && reference/.test(register) && !/case ["']invoice["']/.test(register)) {
    if (!/\/accounting\/invoices\/\$\{reference\}/.test(register) && !/`\/accounting\/invoices\/\$\{reference\}`/.test(register)) {
      errors.push("AccountRegisterPage: sourceRoute must deep-link invoice rows to /accounting/invoices/:id");
    }
  }
  if (!/kind="invoice"/.test(customer)) {
    errors.push("CustomerDetail: must EntityLink invoices");
  }
  if (!/getJournalEntrySourceLinks/.test(jeDetail)) {
    errors.push("JournalEntryDetailPage: reverse source-links must stay wired");
  }
  if (!/kind="journal_entry"/.test(invoiceDetail)) {
    errors.push("InvoiceDetailPage: forward JE EntityLink required");
  }
  if (!/kind="invoice"/.test(paymentDetail)) {
    errors.push("PaymentDetailPage: must EntityLink applied invoices");
  }
  return errors;
}

function selftest() {
  const errors = assertInvoiceReverseRoutes();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED — live sources rejected: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertInvoiceReverseRoutes();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
