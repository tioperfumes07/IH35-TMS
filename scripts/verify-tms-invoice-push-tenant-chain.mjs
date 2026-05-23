#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(lines) {
  console.error("verify:tms-invoice-push-tenant-chain — FAILED");
  for (const line of lines) console.error(`- ${line}`);
  process.exit(1);
}

function read(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`missing file: ${relPath}`);
  }
  return fs.readFileSync(full, "utf8");
}

const failures = [];

let invoiceRoutes = "";
let invoiceLinesRoutes = "";
let handler = "";
let enqueueService = "";

try {
  invoiceRoutes = read("apps/backend/src/accounting/invoices.routes.ts");
  invoiceLinesRoutes = read("apps/backend/src/accounting/invoice-lines.routes.ts");
  handler = read("apps/backend/src/outbox/handlers/tms-invoice-push.handler.ts");
  enqueueService = read("apps/backend/src/qbo/tms-invoice-push-chain.service.ts");
} catch (error) {
  fail([String(error instanceof Error ? error.message : error)]);
}

if (!enqueueService.includes("tms.invoice.push_requested")) {
  failures.push("apps/backend/src/qbo/tms-invoice-push-chain.service.ts:1 missing tms.invoice.push_requested enqueue");
}

if (!invoiceRoutes.includes("enqueueTmsInvoicePushRequested")) {
  failures.push("apps/backend/src/accounting/invoices.routes.ts:1 invoice routes must enqueue tms.invoice.push_requested");
}
if (!invoiceLinesRoutes.includes("enqueueTmsInvoicePushRequested")) {
  failures.push("apps/backend/src/accounting/invoice-lines.routes.ts:1 invoice line writes must enqueue tms.invoice.push_requested");
}
if (!handler.includes("const operating_company_id = requireUuid(payload.operating_company_id")) {
  failures.push("apps/backend/src/outbox/handlers/tms-invoice-push.handler.ts:1 handler must read operating_company_id from payload");
}
if (!handler.includes("FROM accounting.invoices i") || !handler.includes("i.operating_company_id = $2::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-invoice-push.handler.ts:1 invoice fetch must enforce tenant scope");
}
if (!handler.includes("FROM accounting.invoice_lines l") || !handler.includes("l.operating_company_id = $2::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-invoice-push.handler.ts:1 invoice line fetch must enforce tenant scope");
}
if (!handler.includes("FROM mdata.qbo_invoices") || !handler.includes("operating_company_id = $1::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-invoice-push.handler.ts:1 qbo invoice mirror queries must enforce tenant scope");
}
if (!handler.includes("invoice_customer_missing_qbo_id")) {
  failures.push("apps/backend/src/outbox/handlers/tms-invoice-push.handler.ts:1 customer qbo prerequisite must fail fast");
}

if (failures.length > 0) {
  fail(failures);
}

console.log("verify:tms-invoice-push-tenant-chain — OK");
