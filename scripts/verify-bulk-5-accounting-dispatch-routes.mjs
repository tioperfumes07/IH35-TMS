#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    console.error(`[verify-bulk-5-accounting-dispatch-routes] ${message}`);
    process.exit(1);
  }
}

const indexSource = read("apps/backend/src/index.ts");
const loadsBulk = read("apps/backend/src/dispatch/loads-bulk.routes.ts");
const invoicesBulk = read("apps/backend/src/accounting/invoices-bulk.routes.ts");
const billsBulk = read("apps/backend/src/accounting/bills-bulk.routes.ts");
const dispatchBoard = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
const invoicesPage = read("apps/frontend/src/pages/accounting/InvoicesListPage.tsx");
const billsPage = read("apps/frontend/src/pages/accounting/BillsPage.tsx");

assertIncludes(indexSource, "registerLoadsBulkRoutes", "loads bulk routes must be registered in backend index");
assertIncludes(loadsBulk, "/api/v1/dispatch/loads/bulk-update", "loads bulk route path missing");
assertIncludes(loadsBulk, "E_STATE_INVALID", "loads bulk must surface state-machine failures");
assertIncludes(invoicesBulk, "/api/v1/accounting/invoices/bulk-update", "invoices bulk route path missing");
assertIncludes(invoicesBulk, "mark_sent", "invoices bulk must support mark_sent");
assertIncludes(billsBulk, "/api/v1/accounting/bills/bulk-update", "bills bulk route path missing");
assertIncludes(billsBulk, "mark_scheduled", "bills bulk must support mark_scheduled");
assertIncludes(dispatchBoard, "BulkProgressDialog", "dispatch board must surface bulk progress");
assertIncludes(invoicesPage, "mark_factored", "invoices list must wire mark_factored bulk action");
assertIncludes(billsPage, "mark_scheduled", "bills list must wire mark_scheduled bulk action");

console.log("[verify-bulk-5-accounting-dispatch-routes] OK");
