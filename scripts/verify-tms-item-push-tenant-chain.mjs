#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(lines) {
  console.error("verify:tms-item-push-tenant-chain — FAILED");
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

let itemRoutes = "";
let handler = "";
let enqueueService = "";

try {
  itemRoutes = read("apps/backend/src/catalogs/items.routes.ts");
  handler = read("apps/backend/src/outbox/handlers/tms-item-push.handler.ts");
  enqueueService = read("apps/backend/src/qbo/tms-item-push-chain.service.ts");
} catch (error) {
  fail([String(error instanceof Error ? error.message : error)]);
}

if (!enqueueService.includes("tms.item.push_requested")) {
  failures.push("apps/backend/src/qbo/tms-item-push-chain.service.ts:1 missing tms.item.push_requested event enqueue");
}

if (!itemRoutes.includes("enqueueTmsItemPushRequested")) {
  failures.push("apps/backend/src/catalogs/items.routes.ts:1 item write paths must call enqueueTmsItemPushRequested");
}
if (!itemRoutes.includes("operating_company_id: operatingCompanyId")) {
  failures.push("apps/backend/src/catalogs/items.routes.ts:1 enqueue payload must include resolved operating_company_id");
}

if (!handler.includes("const operating_company_id = requireUuid(payload.operating_company_id")) {
  failures.push("apps/backend/src/outbox/handlers/tms-item-push.handler.ts:1 handler must read operating_company_id from payload");
}
if (!handler.includes("FROM catalogs.accounts a") || !handler.includes("a.operating_company_id = $1::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-item-push.handler.ts:1 income account resolution must enforce tenant scope");
}
if (!handler.includes("FROM mdata.qbo_items") || !handler.includes("operating_company_id = $1::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-item-push.handler.ts:1 mdata.qbo_items queries must enforce tenant scope");
}

if (failures.length > 0) {
  fail(failures);
}

console.log("verify:tms-item-push-tenant-chain — OK");
