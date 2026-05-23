#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(lines) {
  console.error("verify:tms-vendor-push-tenant-chain — FAILED");
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

let vendorRoutes = "";
let handler = "";
let enqueueService = "";

try {
  vendorRoutes = read("apps/backend/src/mdata/vendors.routes.ts");
  handler = read("apps/backend/src/outbox/handlers/tms-vendor-push.handler.ts");
  enqueueService = read("apps/backend/src/qbo/tms-vendor-push-chain.service.ts");
} catch (error) {
  fail([String(error instanceof Error ? error.message : error)]);
}

if (!enqueueService.includes("tms.vendor.push_requested")) {
  failures.push("apps/backend/src/qbo/tms-vendor-push-chain.service.ts:1 missing tms.vendor.push_requested event enqueue");
}

if (!vendorRoutes.includes("enqueueTmsVendorPushRequested")) {
  failures.push("apps/backend/src/mdata/vendors.routes.ts:1 vendor write paths must call enqueueTmsVendorPushRequested");
}
if (!vendorRoutes.includes("operating_company_id: String(")) {
  failures.push("apps/backend/src/mdata/vendors.routes.ts:1 enqueue payload must include operating_company_id");
}

const payloadReadMarker = "const operating_company_id = requireUuid(payload.operating_company_id";
if (!handler.includes(payloadReadMarker)) {
  failures.push("apps/backend/src/outbox/handlers/tms-vendor-push.handler.ts:1 handler must read operating_company_id from payload");
}

if (!handler.includes("FROM mdata.vendors v") || !handler.includes("v.operating_company_id = $2::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-vendor-push.handler.ts:1 mdata.vendors query must enforce tenant scope");
}
if (!handler.includes("FROM mdata.qbo_vendors") || !handler.includes("operating_company_id = $1::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-vendor-push.handler.ts:1 mdata.qbo_vendors queries must enforce tenant scope");
}

if (failures.length > 0) {
  fail(failures);
}

console.log("verify:tms-vendor-push-tenant-chain — OK");
