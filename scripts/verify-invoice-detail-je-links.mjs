#!/usr/bin/env node
/**
 * Rule-17 guard: Invoice detail must surface JE EntityLinks (Law §9 P-INVOICE FAIL #12 / ranked P0 #3).
 * Locks enrichInvoice journal_entries + InvoiceDetailPage journal_entry EntityLink + income account drill.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-detail-je-links";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertInvoiceDetailJeLinks() {
  const errors = [];
  const routes = read("apps/backend/src/accounting/invoices.routes.ts");
  const detailPage = read("apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx");
  const api = read("apps/frontend/src/api/accounting.ts");
  const entityLink = read("apps/frontend/src/components/shared/EntityLink.tsx");

  if (!/export async function enrichInvoice/.test(routes)) {
    errors.push("backend: enrichInvoice must remain the invoice detail enricher");
  }
  if (!/journal_entries/.test(routes)) {
    errors.push("backend: enrichInvoice must return journal_entries");
  }
  if (!/source_transaction_type = 'invoice'/.test(routes)) {
    errors.push("backend: journal_entries query must filter source_transaction_type = invoice");
  }
  if (!/customer_payment/.test(routes)) {
    errors.push("backend: journal_entries query must also include customer_payment JEs via payment_applications");
  }
  if (!/income_account_name|income_account_number/.test(routes)) {
    errors.push("backend: invoice lines enrich must join catalogs.accounts for income account labels");
  }
  if (!/source_load_number/.test(routes)) {
    errors.push("backend: enrichInvoice must expose source_load_number for load reverse label");
  }

  if (!/journal_entries\?:/.test(api) && !/journal_entries\?: InvoiceJournalEntryLink/.test(api)) {
    errors.push("api: Invoice type must include journal_entries");
  }
  if (!/InvoiceJournalEntryLink/.test(api)) {
    errors.push("api: InvoiceJournalEntryLink type missing");
  }

  if (!/kind="journal_entry"/.test(detailPage)) {
    errors.push("InvoiceDetailPage: must render EntityLink kind=\"journal_entry\"");
  }
  if (!/invoice-journal-entries/.test(detailPage)) {
    errors.push("InvoiceDetailPage: must expose invoice-journal-entries test id");
  }
  if (!/chart-of-accounts\/register/.test(detailPage)) {
    errors.push("InvoiceDetailPage: income account must link to chart-of-accounts/register");
  }
  if (!/kind="customer"/.test(detailPage)) {
    errors.push("InvoiceDetailPage: must keep customer EntityLink");
  }
  if (!/kind="load"/.test(detailPage)) {
    errors.push("InvoiceDetailPage: must keep load EntityLink");
  }
  if (!/kind="payment"/.test(detailPage)) {
    errors.push("InvoiceDetailPage: must keep payment EntityLink on applications");
  }

  if (!/`\/accounting\/invoices\/\$\{id\}`/.test(entityLink) && !/"\/accounting\/invoices\/${id}"/.test(entityLink)) {
    // EntityLink uses template: `/accounting/invoices/${id}`
    if (!/case "invoice":[\s\S]*?\/accounting\/invoices\//.test(entityLink)) {
      errors.push("EntityLink: invoice must resolve to /accounting/invoices/:id");
    }
  }

  return errors;
}

function selftest() {
  const errors = assertInvoiceDetailJeLinks();
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

const errors = assertInvoiceDetailJeLinks();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
