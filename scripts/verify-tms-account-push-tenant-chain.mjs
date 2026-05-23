#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(lines) {
  console.error("verify:tms-account-push-tenant-chain — FAILED");
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

let accountRoutes = "";
let handler = "";
let enqueueService = "";

try {
  accountRoutes = read("apps/backend/src/catalogs/accounts.routes.ts");
  handler = read("apps/backend/src/outbox/handlers/tms-account-push.handler.ts");
  enqueueService = read("apps/backend/src/qbo/tms-account-push-chain.service.ts");
} catch (error) {
  fail([String(error instanceof Error ? error.message : error)]);
}

if (!enqueueService.includes("tms.account.push_requested")) {
  failures.push("apps/backend/src/qbo/tms-account-push-chain.service.ts:1 missing tms.account.push_requested event enqueue");
}

if (!accountRoutes.includes("enqueueTmsAccountPushRequested")) {
  failures.push("apps/backend/src/catalogs/accounts.routes.ts:1 account write paths must call enqueueTmsAccountPushRequested");
}
if (!accountRoutes.includes("operating_company_id: operatingCompanyId")) {
  failures.push("apps/backend/src/catalogs/accounts.routes.ts:1 enqueue payload must include resolved operating_company_id");
}

if (!handler.includes("const operating_company_id = requireUuid(payload.operating_company_id")) {
  failures.push("apps/backend/src/outbox/handlers/tms-account-push.handler.ts:1 handler must read operating_company_id from payload");
}
if (!handler.includes("FROM catalogs.accounts a") || !handler.includes("a.operating_company_id = $2::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-account-push.handler.ts:1 source account fetch must enforce tenant scope");
}
if (!handler.includes("FROM mdata.qbo_accounts") || !handler.includes("operating_company_id = $1::uuid")) {
  failures.push("apps/backend/src/outbox/handlers/tms-account-push.handler.ts:1 mdata.qbo_accounts queries must enforce tenant scope");
}

if (failures.length > 0) {
  fail(failures);
}

console.log("verify:tms-account-push-tenant-chain — OK");
