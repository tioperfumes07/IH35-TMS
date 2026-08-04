#!/usr/bin/env node
/**
 * CUST-LINK-01 — Customer → invoice → invoice_lines chain closes with honest
 * line-empty UX when Neon invoice_lines density is sparse (not a silent blank table).
 *
 * Live Neon 2026-08-03 (bypass_rls=lucia, br-fancy-credit-akjnd07a):
 *   accounting.invoices=11981 · accounting.invoice_lines=5 — header-only invoices are normal.
 *
 *   node scripts/verify-cust-link-01-invoice-lines-honest.mjs
 *   node scripts/verify-cust-link-01-invoice-lines-honest.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-cust-link-01-invoice-lines-honest";
const INVOICE_PAGE = "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx";
const CUSTOMERS_PAGE = "apps/frontend/src/pages/Customers.tsx";
const API = "apps/frontend/src/api/accounting.ts";

function assert(files) {
  const problems = [];
  const invoicePage = files[INVOICE_PAGE] ?? "";
  const customersPage = files[CUSTOMERS_PAGE] ?? "";
  const api = files[API] ?? "";

  if (!/getInvoice/.test(api)) {
    problems.push(`${API}: must export getInvoice for invoice detail fetch`);
  }
  if (!/invoice-lines-honest-empty/.test(invoicePage)) {
    problems.push(`${INVOICE_PAGE}: must render data-testid=invoice-lines-honest-empty when lines are absent`);
  }
  if (!/sparse/i.test(invoicePage) || !/invoice_lines/i.test(invoicePage)) {
    problems.push(`${INVOICE_PAGE}: honest empty must name sparse invoice_lines density (not a blank table)`);
  }
  if (!/lineCount === 0/.test(invoicePage)) {
    problems.push(`${INVOICE_PAGE}: must branch on zero lines instead of always rendering an empty grid`);
  }
  if (!/\+ Create Line/.test(invoicePage)) {
    problems.push(`${INVOICE_PAGE}: draft invoices must still offer + Create Line`);
  }
  if (!/EntityLink kind="invoice"/.test(customersPage) && !/\/accounting\/invoices\/\$\{/.test(customersPage)) {
    problems.push(`${CUSTOMERS_PAGE}: transaction list must drill to invoice detail (EntityLink or navigate)`);
  }
  if (!/getInvoice\(/.test(invoicePage)) {
    problems.push(`${INVOICE_PAGE}: must fetch invoice detail via getInvoice(`);
  }
  return problems;
}

const files = Object.fromEntries(
  [INVOICE_PAGE, CUSTOMERS_PAGE, API].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]),
);

if (SELFTEST) {
  const planted = {
    ...files,
    [INVOICE_PAGE]: files[INVOICE_PAGE]
      .replace(/data-testid="invoice-lines-honest-empty"/g, "")
      .replace(/sparse/gi, "present"),
  };
  const caught = assert(planted);
  if (!caught.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted blank honest empty not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — invoice line-empty UX locked (Neon lucia invoices=11981 · invoice_lines=5 sparse; no backfill in this PR)`,
);
process.exit(0);
