#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const servicePath = path.join(process.cwd(), "apps/backend/src/accounting/escrow/service.ts");
const routePath = path.join(process.cwd(), "apps/backend/src/accounting/escrow/routes.ts");
const migrationPath = path.join(process.cwd(), "db/migrations/0234_block_23_escrow_posting_flow.sql");

function fail(message) {
  console.error(`verify:escrow-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [servicePath, routePath, migrationPath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const service = fs.readFileSync(servicePath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");

if (!service.includes("set_config('app.operating_company_id'")) fail("escrow service must set tenant scope");
if (!service.includes("operating_company_id = $1::uuid") && !service.includes("operating_company_id = $2::uuid")) {
  fail("escrow service queries must filter by operating_company_id");
}
if (!route.includes("companyQuerySchema")) fail("escrow routes must require operating_company_id query contract");
if (!migration.includes("ENABLE ROW LEVEL SECURITY")) fail("escrow migration must enable RLS");

console.log("verify:escrow-tenant-scope — OK");
