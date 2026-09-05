#!/usr/bin/env node
/**
 * LFI-11 / INV-SEARCH-01 guard (owner 2026-09-05): invoice search report page.
 * Asserts:
 *   1. Frontend report page exists at pages/reports/InvoiceSearchReportPage.tsx
 *   2. Route is wired in manifest.tsx
 *   3. Sub-nav link exists in ReportsSubNav.tsx
 *   4. Page uses ParityTable with storageKey
 *   5. Page uses server-side search (listInvoices with search param)
 *   6. Page uses server-side sort (useUrlSort + sort/dir params)
 *   7. Dates use MMM-DD format (formatPlannerDayLabel)
 *   8. Backend invoice list endpoint supports search + sort (already existed)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const failures = [];

// 1. Frontend page
const page = read("apps/frontend/src/pages/reports/InvoiceSearchReportPage.tsx");
if (!page.includes("ParityTable")) {
  failures.push("InvoiceSearchReportPage.tsx: must use ParityTable");
}
if (!page.includes("storageKey")) {
  failures.push("InvoiceSearchReportPage.tsx: must have storageKey (gear)");
}
if (!page.includes("formatPlannerDayLabel")) {
  failures.push("InvoiceSearchReportPage.tsx: must use formatPlannerDayLabel for MMM-DD dates");
}
if (!page.includes("listInvoices")) {
  failures.push("InvoiceSearchReportPage.tsx: must call listInvoices API (server-side query)");
}
if (!page.includes("useUrlSort")) {
  failures.push("InvoiceSearchReportPage.tsx: must use useUrlSort for server-side sort");
}
if (!page.includes('data-testid="invoice-search-input"')) {
  failures.push("InvoiceSearchReportPage.tsx: must have search input with data-testid");
}

// 2. Route in manifest
const manifest = read("apps/frontend/src/routes/manifest.tsx");
if (!manifest.includes("InvoiceSearchReportPage")) {
  failures.push("manifest.tsx: missing InvoiceSearchReportPage import/route");
}
if (!manifest.includes('path="/reports/invoice-search"')) {
  failures.push("manifest.tsx: missing /reports/invoice-search route");
}

// 3. Sub-nav
const subNav = read("apps/frontend/src/pages/reports/ReportsSubNav.tsx");
if (!subNav.includes("/reports/invoice-search")) {
  failures.push("ReportsSubNav.tsx: missing Invoice Search link");
}

// 4. Backend already supports search + sort (verify it's still there)
const invoiceRoutes = read("apps/backend/src/accounting/invoices.routes.ts");
if (!invoiceRoutes.includes("buildListSearchClause")) {
  failures.push("invoices.routes.ts: must use buildListSearchClause (shared server-side query builder)");
}
if (!invoiceRoutes.includes("INVOICE_LIST_SORT_SQL")) {
  failures.push("invoices.routes.ts: must have INVOICE_LIST_SORT_SQL whitelist for sort");
}

if (failures.length) {
  console.error("FAIL verify-lfi11-invoice-search:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-lfi11-invoice-search — Invoice search report page (LFI-11/INV-SEARCH-01): server-side search + sort, MMM-DD dates, ParityTable, sub-nav wired");
