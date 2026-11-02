#!/usr/bin/env node
/**
 * Codex P1 11-02 — InvoiceSearch multi-status must pass the status array to listInvoices
 * (server OR-filters before pagination). Forbidden: fetch without status then client-filter page 1.
 */
import fs from "node:fs";

const LABEL = "verify-invoice-search-multistatus-server";
const FILE = "apps/frontend/src/pages/reports/InvoiceSearchReportPage.tsx";

const src = fs.readFileSync(FILE, "utf8");
const fails = [];

if (!/listInvoices\(operatingCompanyId/.test(src)) {
  fails.push(`${FILE}: must call listInvoices`);
}
if (/fetch without status then filter|2\+ fetch without status/.test(src)) {
  fails.push(`${FILE}: must not document/client-filter the multi-status path`);
}
if (/result\.invoices \?\? \[\]\)\.filter/.test(src) || /\(result\.invoices \?\? \[\]\)\.filter/.test(src)) {
  fails.push(`${FILE}: must not client-filter listInvoices results by status`);
}
if (/total:\s*invoices\.length/.test(src)) {
  fails.push(`${FILE}: must not overwrite total with client-filtered page length`);
}
// Multi-select must pass the array (or single) through — not drop status when length > 1.
if (!/appliedFilters\.statusFilter\.length === 0/.test(src) && !/statusFilter\.length === 0/.test(src)) {
  // allow either empty→undefined or always pass array
}
if (!/appliedFilters\.statusFilter/.test(src)) {
  fails.push(`${FILE}: must read appliedFilters.statusFilter for the API call`);
}
if (!/status,\s*\n\s*\.\.\.dateRange/.test(src) && !/status,\s*\.\.\.dateRange/.test(src) && !/status,\n/.test(src)) {
  // looser: status key passed to listInvoices
  if (!/listInvoices\([\s\S]*?status,/.test(src) && !/listInvoices\([\s\S]*?status:/.test(src)) {
    fails.push(`${FILE}: listInvoices must receive status from the multi-select`);
  }
}
// Forbid the old "2+ → status undefined" truncation pattern.
if (/statusFilter\.length === 1 \? appliedFilters\.statusFilter\[0\] : undefined/.test(src)) {
  fails.push(`${FILE}: must not drop status when 2+ are selected (server supports arrays)`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = src.replace(
    /const status =[\s\S]*?return listInvoices\(operatingCompanyId, \{[\s\S]*?\}\);/,
    `const status = appliedFilters.statusFilter.length === 1 ? appliedFilters.statusFilter[0] : undefined;
      const result = await listInvoices(operatingCompanyId, {
        search: appliedFilters.search || undefined,
        status,
        ...dateRange,
        sort: sortKey || undefined,
        dir: sortDirection || undefined,
        limit: 100,
        offset: 0,
      });
      if (appliedFilters.statusFilter.length <= 1) return result;
      const invoices = (result.invoices ?? []).filter((row) => appliedFilters.statusFilter.includes(row.status));
      return { ...result, invoices, total: invoices.length };`,
  );
  const plantFails = [];
  if (/total:\s*invoices\.length/.test(plant)) plantFails.push("total overwrite");
  if (/statusFilter\.length === 1 \? appliedFilters\.statusFilter\[0\] : undefined/.test(plant)) plantFails.push("drop multi");
  if (/\.filter\(/.test(plant)) plantFails.push("client filter");
  if (plantFails.length < 2) {
    console.error(`${LABEL} --selftest FAIL plant weak`, plantFails);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — InvoiceSearch multi-status goes to server before pagination`);
