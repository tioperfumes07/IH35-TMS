#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const pushPath = path.join(ROOT, "apps/backend/src/sync/qbo-customers-push.ts");
const statusPath = path.join(ROOT, "apps/backend/src/sync/qbo-customers-status.routes.ts");
const migrationPath = path.join(ROOT, "db/migrations/0319_qbo_customers_push_sync_status.sql");

function fail(message) {
  console.error(`verify:qbo-push-rls-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [pushPath, statusPath, migrationPath]) {
  if (!fs.existsSync(file)) fail(`${file.replace(`${ROOT}/`, "")} not found`);
}

const pushText = fs.readFileSync(pushPath, "utf8");
const statusText = fs.readFileSync(statusPath, "utf8");
const migrationText = fs.readFileSync(migrationPath, "utf8");

if (!pushText.includes("app.operating_company_id")) {
  fail("push scheduler must set app.operating_company_id per row");
}
if (!pushText.includes("operating_company_id = $2::uuid")) {
  fail("push updates must include operating_company_id predicate");
}
if (!pushText.includes("FOR UPDATE SKIP LOCKED")) {
  fail("batch claim must use tenant-safe row locking");
}

const routeMatch = statusText.match(/app\.get\("\/api\/v1\/sync\/qbo-customers\/status"[\s\S]*?\n  \}\);/m);
if (!routeMatch) {
  fail("could not locate /api/v1/sync/qbo-customers/status route");
}
if (!/operating_company_id = \$1::uuid/.test(statusText)) {
  fail("status counts must filter by operating_company_id");
}
if (!statusText.includes("set_config('app.operating_company_id'")) {
  fail("status route must set tenant context before querying accounting.qbo_customers");
}

if (!migrationText.includes("qbo_customers_accounting_tenant_scope")) {
  fail("migration must define accounting.qbo_customers tenant RLS policy");
}
if (!migrationText.includes("app.operating_company_id")) {
  fail("migration RLS policy must scope by app.operating_company_id");
}

console.log("verify:qbo-push-rls-tenant-scope — OK");
