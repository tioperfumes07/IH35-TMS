#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(lines) {
  console.error("verify:tms-customer-push-tenant-chain — FAILED");
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

let customerRoutes = "";
let handler = "";
let enqueueService = "";

try {
  customerRoutes = read("apps/backend/src/mdata/customers.routes.ts");
  handler = read("apps/backend/src/outbox/handlers/tms-customer-push.handler.ts");
  enqueueService = read("apps/backend/src/qbo/tms-customer-push-chain.service.ts");
} catch (error) {
  fail([String(error instanceof Error ? error.message : error)]);
}

if (!enqueueService.includes("tms.customer.push_requested")) {
  failures.push("apps/backend/src/qbo/tms-customer-push-chain.service.ts:1 missing tms.customer.push_requested event enqueue");
}

if (!customerRoutes.includes("enqueueTmsCustomerPushRequested")) {
  failures.push("apps/backend/src/mdata/customers.routes.ts:1 customer write paths must call enqueueTmsCustomerPushRequested");
}
if (!customerRoutes.includes("operating_company_id: String(")) {
  failures.push("apps/backend/src/mdata/customers.routes.ts:1 enqueue payload must include operating_company_id");
}

const payloadReadMarker = "const operating_company_id = requireUuid(payload.operating_company_id";
if (!handler.includes(payloadReadMarker)) {
  failures.push("apps/backend/src/outbox/handlers/tms-customer-push.handler.ts:1 handler must read operating_company_id from payload");
}

if (!handler.includes("FROM mdata.customers c") || !handler.includes("c.operating_company_id = $2::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-customer-push.handler.ts:1 mdata.customers query must enforce tenant scope");
}
if (!handler.includes("FROM mdata.qbo_customers") || !handler.includes("operating_company_id = $1::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-customer-push.handler.ts:1 mdata.qbo_customers queries must enforce tenant scope");
}

if (failures.length > 0) {
  fail(failures);
}

console.log("verify:tms-customer-push-tenant-chain — OK");
