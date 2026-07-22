#!/usr/bin/env node
/**
 * P-INVOICE P0 (#3177) — Law §9 invoice linkage fail-closed + EntityLink drill.
 *
 * 1) Posting engine refuses null income account (no invented CoA).
 * 2) Load-revenue invoices require source_load_id.
 * 3) Invoice detail → JE EntityLink; JE detail → source-links reverse (incl. invoice).
 *
 * Rule 17: verify-step only — do NOT edit package.json / locked-guards / ci.yml.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-p0-linkage";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertInvoiceP0() {
  const errors = [];
  const posting = read("apps/backend/src/accounting/posting-engine.service.ts");
  const guards = read("apps/backend/src/accounting/invoice-linkage-guards.ts");
  const routes = read("apps/backend/src/accounting/posting-engine.routes.ts");
  const invoices = read("apps/backend/src/accounting/invoices.routes.ts");
  const invoiceDetail = read("apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx");
  const jeDetail = read("apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx");
  const api = read("apps/frontend/src/api/accounting.ts");

  if (!/InvoiceRevenueAccountError/.test(posting) || !/"INVOICE_LINE_REVENUE_UNRESOLVED"/.test(posting)) {
    errors.push("posting-engine: must hard-fail INVOICE_LINE_REVENUE_UNRESOLVED (null income)");
  }
  if (/revenue_default/.test(posting) || /resolveFirstAccountByType/.test(posting)) {
    errors.push("posting-engine: must not invent/default a revenue CoA account");
  }
  if (!/INVOICE_LOAD_SOURCE_REQUIRED/.test(posting) || !/assertLoadRevenueHasSourceLoad/.test(posting)) {
    errors.push("posting-engine: must fail closed when load revenue lacks source_load_id");
  }
  if (!/LOAD_REVENUE_LINE_TYPES/.test(guards) || !/assertLoadRevenueHasSourceLoad/.test(guards)) {
    errors.push("invoice-linkage-guards: LOAD_REVENUE_LINE_TYPES + assertLoadRevenueHasSourceLoad required");
  }
  if (!/assertRevenueLinesHaveIncomeAccount/.test(guards)) {
    errors.push("invoice-linkage-guards: assertRevenueLinesHaveIncomeAccount required");
  }
  if (!/HOLD designate/.test(guards) && !/HOLD designate/.test(posting)) {
    errors.push("guards/posting: clear HOLD designate messaging when map/role missing");
  }
  if (!/invoice_load_source_required/.test(routes) || !/invoice_line_revenue_unresolved/.test(routes)) {
    errors.push("posting-engine.routes: must map load-source + income unresolved errors");
  }
  if (!/assertLoadRevenueHasSourceLoad/.test(invoices) || !/assertRevenueLinesHaveIncomeAccount/.test(invoices)) {
    errors.push("invoices.routes send: must fail closed on income + source_load_id");
  }
  if (!/getAccountingSourceLineage/.test(invoiceDetail)) {
    errors.push("InvoiceDetailPage: must call getAccountingSourceLineage for JE hop");
  }
  if (!/kind=\"journal_entry\"/.test(invoiceDetail) && !/kind=\{\"journal_entry\"\}/.test(invoiceDetail)) {
    errors.push("InvoiceDetailPage: must EntityLink kind=journal_entry");
  }
  if (!/invoice-journal-entry-links/.test(invoiceDetail)) {
    errors.push("InvoiceDetailPage: must expose invoice-journal-entry-links test id");
  }
  if (!/export function getJournalEntrySourceLinks\(/.test(api) || !/source-links/.test(api)) {
    errors.push("api: getJournalEntrySourceLinks client must hit .../source-links");
  }
  if (!/getJournalEntrySourceLinks/.test(jeDetail)) {
    errors.push("JournalEntryDetailPage: must call getJournalEntrySourceLinks (reverse)");
  }
  if (!/case \"invoice\"/.test(jeDetail) && !/case 'invoice'/.test(jeDetail)) {
    errors.push("JournalEntryDetailPage: must map invoice source type to EntityLink");
  }
  if (!/EntityLink/.test(jeDetail) || !/Source links/.test(jeDetail)) {
    errors.push("JournalEntryDetailPage: must render Source links EntityLinks");
  }
  return errors;
}

function selftest() {
  const errors = assertInvoiceP0();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED — ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertInvoiceP0();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
