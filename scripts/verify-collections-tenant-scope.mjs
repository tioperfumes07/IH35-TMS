#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const servicePath = path.join(process.cwd(), "apps/backend/src/accounting/collections.service.ts");
const routesPath = path.join(process.cwd(), "apps/backend/src/accounting/collections.routes.ts");
const cronPath = path.join(process.cwd(), "apps/backend/src/cron/collections-sync.cron.ts");
const migrationPath = path.join(process.cwd(), "db/migrations/0238_accounting_ar_collection_tasks.sql");

function fail(message) {
  console.error(`verify:collections-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [servicePath, routesPath, cronPath, migrationPath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const serviceSource = fs.readFileSync(servicePath, "utf8");
const routeSource = fs.readFileSync(routesPath, "utf8");
const cronSource = fs.readFileSync(cronPath, "utf8");
const migrationSource = fs.readFileSync(migrationPath, "utf8");

if (!serviceSource.includes("set_config('app.operating_company_id'")) {
  fail("service must set app.operating_company_id before SQL");
}
if (!serviceSource.includes("WHERE operating_company_id = $1::uuid")) {
  fail("service must scope reads/writes by operating_company_id");
}
if (!routeSource.includes("companyQuerySchema")) {
  fail("routes must require operating_company_id contract");
}
if (!cronSource.includes("assertTenantContext")) {
  fail("cron must assert tenant context before each company sync");
}
if (!migrationSource.includes("ENABLE ROW LEVEL SECURITY")) {
  fail("migration must enable RLS for collection tables");
}

console.log("verify:collections-tenant-scope — OK");
