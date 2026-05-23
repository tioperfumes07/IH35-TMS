#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps", "backend", "src", "reports", "library.routes.ts");

function fail(message) {
  console.error(`verify:fleet-snapshot-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("apps/backend/src/reports/library.routes.ts not found");
}

const text = fs.readFileSync(TARGET, "utf8");
const routeMatch = text.match(/app\.get\("\/api\/v1\/reports\/home-fleet-snapshot"[\s\S]*?\n  \}\);/m);
if (!routeMatch) {
  fail("could not locate /api/v1/reports/home-fleet-snapshot route");
}

const routeBlock = routeMatch[0];

if (!/set_config\('app\.operating_company_id'/.test(routeBlock)) {
  fail("route must set app.operating_company_id tenant context");
}

if (!/operating_company_id\s*=\s*current_setting\('app\.operating_company_id', true\)::uuid/.test(routeBlock)) {
  fail("backing query must include operating_company_id where-clause");
}

if (!/FROM mdata\.units/.test(routeBlock) || !/total_units/.test(routeBlock)) {
  fail("route must compute total units from mdata.units");
}

console.log("verify:fleet-snapshot-tenant-scope — OK");
