#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const customerPushPath = path.join(ROOT, "apps/backend/src/sync/qbo-customers-push.ts");
const customerStatusPath = path.join(ROOT, "apps/backend/src/sync/qbo-customers-status.routes.ts");
const customerMigrationPath = path.join(ROOT, "db/migrations/0319_qbo_customers_push_sync_status.sql");
const vendorPushPath = path.join(ROOT, "apps/backend/src/sync/qbo-vendors-push.ts");
const vendorStatusPath = path.join(ROOT, "apps/backend/src/sync/qbo-vendors-status.routes.ts");
const vendorMigrationPath = path.join(ROOT, "db/migrations/0321_qbo_vendors_push_sync_status.sql");
const accountsPushPath = path.join(ROOT, "apps/backend/src/sync/qbo-accounts-push.ts");
const accountsStatusPath = path.join(ROOT, "apps/backend/src/sync/qbo-accounts-status.routes.ts");
const accountsMigrationPath = path.join(ROOT, "db/migrations/0323_qbo_accounts_sync_state.sql");

function fail(message) {
  console.error(`verify:qbo-push-rls-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [
  customerPushPath,
  customerStatusPath,
  customerMigrationPath,
  vendorPushPath,
  vendorStatusPath,
  vendorMigrationPath,
  accountsPushPath,
  accountsStatusPath,
  accountsMigrationPath,
]) {
  if (!fs.existsSync(file)) fail(`${file.replace(`${ROOT}/`, "")} not found`);
}

const customerPushText = fs.readFileSync(customerPushPath, "utf8");
const customerStatusText = fs.readFileSync(customerStatusPath, "utf8");
const customerMigrationText = fs.readFileSync(customerMigrationPath, "utf8");
const vendorPushText = fs.readFileSync(vendorPushPath, "utf8");
const vendorStatusText = fs.readFileSync(vendorStatusPath, "utf8");
const vendorMigrationText = fs.readFileSync(vendorMigrationPath, "utf8");
const accountsPushText = fs.readFileSync(accountsPushPath, "utf8");
const accountsStatusText = fs.readFileSync(accountsStatusPath, "utf8");
const accountsMigrationText = fs.readFileSync(accountsMigrationPath, "utf8");

function assertPushScheduler(pushText, tableName) {
  if (!pushText.includes("app.operating_company_id")) {
    fail(`${tableName} push scheduler must set app.operating_company_id per row`);
  }
  if (!pushText.includes("operating_company_id = $2::uuid")) {
    fail(`${tableName} push updates must include operating_company_id predicate`);
  }
  if (!pushText.includes("FOR UPDATE SKIP LOCKED")) {
    fail(`${tableName} batch claim must use tenant-safe row locking`);
  }
}

function assertStatusRoute(statusText, routePath, tableName, migrationText, policyName) {
  const routeMatch = statusText.match(new RegExp(`app\\.get\\("${routePath.replace(/\//g, "\\/")}"[\\s\\S]*?\\n  \\}\\);`, "m"));
  if (!routeMatch) fail(`could not locate ${routePath} route`);
  if (!/operating_company_id = \$1::uuid/.test(statusText)) {
    fail(`${routePath} counts must filter by operating_company_id`);
  }
  if (!statusText.includes("set_config('app.operating_company_id'")) {
    fail(`${routePath} must set tenant context before querying accounting.${tableName}`);
  }
  if (!migrationText.includes(policyName)) {
    fail(`migration must define accounting.${tableName} tenant RLS policy ${policyName}`);
  }
  if (!migrationText.includes("app.operating_company_id")) {
    fail(`migration RLS policy for accounting.${tableName} must scope by app.operating_company_id`);
  }
}

assertPushScheduler(customerPushText, "customers");
assertPushScheduler(vendorPushText, "vendors");
assertPushScheduler(accountsPushText, "accounts");
assertStatusRoute(
  customerStatusText,
  "/api/v1/sync/qbo-customers/status",
  "qbo_customers",
  customerMigrationText,
  "qbo_customers_accounting_tenant_scope"
);
assertStatusRoute(
  vendorStatusText,
  "/api/v1/sync/qbo-vendors/status",
  "qbo_vendors",
  vendorMigrationText,
  "qbo_vendors_accounting_tenant_scope"
);
assertStatusRoute(
  accountsStatusText,
  "/api/v1/sync/qbo-accounts/status",
  "qbo_accounts",
  accountsMigrationText,
  "qbo_accounts_accounting_tenant_scope"
);

if (!vendorStatusText.includes("withCurrentUser")) {
  fail("vendors status route must scope reads with withCurrentUser");
}
if (!accountsStatusText.includes("withCurrentUser")) {
  fail("accounts status route must scope reads with withCurrentUser");
}

console.log("verify:qbo-push-rls-tenant-scope — OK");
