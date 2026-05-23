#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(lines) {
  console.error("verify:tms-bill-push-tenant-chain — FAILED");
  for (const line of lines) console.error(`- ${line}`);
  process.exit(1);
}

function read(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) throw new Error(`missing file: ${relPath}`);
  return fs.readFileSync(full, "utf8");
}

const failures = [];

let billService = "";
let enqueueService = "";
let handler = "";

try {
  billService = read("apps/backend/src/accounting/bills.service.ts");
  enqueueService = read("apps/backend/src/qbo/tms-bill-push-chain.service.ts");
  handler = read("apps/backend/src/outbox/handlers/tms-bill-push.handler.ts");
} catch (error) {
  fail([String(error instanceof Error ? error.message : error)]);
}

if (!enqueueService.includes("tms.bill.push_requested")) {
  failures.push("apps/backend/src/qbo/tms-bill-push-chain.service.ts:1 missing tms.bill.push_requested event enqueue");
}

if (!billService.includes("enqueueTmsBillPushRequested")) {
  failures.push("apps/backend/src/accounting/bills.service.ts:1 bill write flows must enqueue tms.bill.push_requested");
}
if (!billService.includes("operating_company_id: input.operatingCompanyId")) {
  failures.push("apps/backend/src/accounting/bills.service.ts:1 enqueue payload must include operating_company_id");
}
if (!billService.includes("bill_id: input.billId") || !billService.includes("bill_id: bill.id")) {
  failures.push("apps/backend/src/accounting/bills.service.ts:1 enqueue payload must include bill_id for create/update paths");
}

if (!handler.includes("const operating_company_id = requireUuid(payload.operating_company_id")) {
  failures.push("apps/backend/src/outbox/handlers/tms-bill-push.handler.ts:1 handler must read operating_company_id from payload");
}
if (!handler.includes("FROM accounting.bills b") || !handler.includes("b.operating_company_id = $2::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-bill-push.handler.ts:1 bill fetch must enforce tenant scope");
}
if (!handler.includes("LEFT JOIN mdata.vendors v") || !handler.includes("v.operating_company_id = b.operating_company_id")) {
  failures.push("apps/backend/src/outbox/handlers/tms-bill-push.handler.ts:1 vendor lookup must enforce tenant scope");
}
if (!handler.includes("FROM catalogs.accounts a") || !handler.includes("a.operating_company_id = $1::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-bill-push.handler.ts:1 account lookup must enforce tenant scope");
}

if (failures.length > 0) fail(failures);

console.log("verify:tms-bill-push-tenant-chain — OK");
