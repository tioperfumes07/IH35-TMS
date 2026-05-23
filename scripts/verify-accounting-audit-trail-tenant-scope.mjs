#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const routePath = path.join(process.cwd(), "apps/backend/src/accounting/audit-trail/routes.ts");
const servicePath = path.join(process.cwd(), "apps/backend/src/accounting/audit-trail/service.ts");

function fail(message) {
  console.error(`verify:accounting-audit-trail-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [routePath, servicePath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const routeSource = fs.readFileSync(routePath, "utf8");
const serviceSource = fs.readFileSync(servicePath, "utf8");

if (!routeSource.includes("withCompanyScope")) {
  fail("routes must execute inside withCompanyScope");
}
if (!routeSource.includes("operating_company_id")) {
  fail("route query must require operating_company_id");
}
if (!/jp\.operating_company_id = \$1::uuid/.test(serviceSource)) {
  fail("audit trail query must filter postings by operating_company_id");
}
if (!/JOIN accounting\.journal_entries/.test(serviceSource)) {
  fail("audit trail must anchor to journal entries for immutable posting context");
}

console.log("verify:accounting-audit-trail-tenant-scope — OK");
