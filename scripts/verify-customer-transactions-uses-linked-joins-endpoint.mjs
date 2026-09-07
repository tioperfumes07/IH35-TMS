#!/usr/bin/env node
// VC-06 (Customers & Vendors module, 2026-09-07 raw findings): the Customer detail page's
// Transaction List showed "—" for Load#/Settlement#/Truck#/Pick-up date/Delivery date/Loaded
// miles -- Customers.tsx's txColumns already model those exact linked_* fields, but the query
// backing them called listAllInvoices (GET /accounting/invoices), which never joins
// mdata.units/mdata.load_stops/driver_finance.driver_settlements. GET /api/v1/customers/:id/invoices
// (customer-invoices.routes.ts) already carries the correct joins and was already registered +
// DB-tested -- it was just never called by any frontend page. Static guard: asserts Customers.tsx's
// invoicesQuery calls the customer-scoped route (listAllCustomerInvoices), not the generic one.
import fs from "node:fs";

const LABEL = "verify-customer-transactions-uses-linked-joins-endpoint";
const PAGE_FILE = "apps/frontend/src/pages/Customers.tsx";
const API_FILE = "apps/frontend/src/api/accounting.ts";
const BACKEND_FILE = "apps/backend/src/mdata/customer-invoices.routes.ts";

export function pageUsesCustomerInvoicesQuery(src) {
  const match = src.match(/const invoicesQuery = useQuery\(\{[\s\S]*?queryFn:\s*\(\)\s*=>\s*([\s\S]*?),\n\s*enabled:/);
  if (!match) return false;
  return /listAllCustomerInvoices\(/.test(match[1]);
}

export function apiHasCustomerInvoicesFunctions(src) {
  return (
    /export function listCustomerInvoices\(/.test(src) &&
    /export async function listAllCustomerInvoices\(/.test(src) &&
    /\/api\/v1\/customers\/\$\{encodeURIComponent\(customerId\)\}\/invoices/.test(src)
  );
}

export function backendJoinsLinkedFields(src) {
  return (
    /^\s*LEFT JOIN mdata\.units u ON/m.test(src) &&
    /^\s*LEFT JOIN LATERAL[\s\S]{0,200}driver_finance\.driver_settlements/m.test(src) &&
    /linked_settlement_id/.test(src) &&
    /linked_unit_number/.test(src)
  );
}

function violations(pageSrc, apiSrc, backendSrc) {
  const errors = [];
  if (!pageUsesCustomerInvoicesQuery(pageSrc)) errors.push("Customers.tsx's invoicesQuery (backs the Transaction List's Load#/Settlement#/Truck# columns) no longer calls listAllCustomerInvoices -- it will go back to showing dashes");
  if (!apiHasCustomerInvoicesFunctions(apiSrc)) errors.push("accounting.ts is missing listCustomerInvoices/listAllCustomerInvoices wired to GET /api/v1/customers/:id/invoices");
  if (!backendJoinsLinkedFields(backendSrc)) errors.push("customer-invoices.routes.ts no longer joins mdata.units/driver_finance.driver_settlements -- the route this fix depends on would stop returning linked_settlement_id/linked_unit_number");
  return errors;
}

function check(pageSrc, apiSrc, backendSrc) {
  const errors = violations(pageSrc, apiSrc, backendSrc);
  if (errors.length) throw new Error(errors.join("; "));
}

const pageSrc = fs.readFileSync(PAGE_FILE, "utf8");
const apiSrc = fs.readFileSync(API_FILE, "utf8");
const backendSrc = fs.readFileSync(BACKEND_FILE, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    [pageSrc.replace("listAllCustomerInvoices(selectedCustomer!.id, companyId,", "listAllInvoices(companyId,"), apiSrc, backendSrc],
    [pageSrc, apiSrc.replace("export function listCustomerInvoices(", "export function listCustomerInvoicesRenamed("), backendSrc],
    [pageSrc, apiSrc.replace("export async function listAllCustomerInvoices(", "export async function listAllCustomerInvoicesRenamed("), backendSrc],
    [pageSrc, apiSrc, backendSrc.replace("LEFT JOIN mdata.units u ON", "-- LEFT JOIN mdata.units u ON")],
    [pageSrc, apiSrc, backendSrc.replace(/driver_finance\.driver_settlements/g, "driver_finance_driver_settlements_renamed")],
  ];
  for (const [p, a, b] of mutations) {
    try { check(p, a, b); }
    catch { caught += 1; continue; }
    throw new Error("a mutation escaped detection");
  }
  check(pageSrc, apiSrc, backendSrc);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(pageSrc, apiSrc, backendSrc);
  console.log(`${LABEL} PASS -- Customer Transaction List reads the joined customer-invoices route; Load#/Settlement#/Truck#/dates/miles are wired`);
}
