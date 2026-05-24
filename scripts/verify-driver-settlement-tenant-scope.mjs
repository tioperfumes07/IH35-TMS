#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const servicePath = path.join(process.cwd(), "apps/backend/src/payroll/driver-settlement.service.ts");
const routesPath = path.join(process.cwd(), "apps/backend/src/payroll/driver-settlement.routes.ts");

function fail(message) {
  console.error(`verify:driver-settlement-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [servicePath, routesPath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const serviceText = fs.readFileSync(servicePath, "utf8");
const routeText = fs.readFileSync(routesPath, "utf8");

if (!serviceText.includes("set_config('app.operating_company_id'")) {
  fail("service must set app.operating_company_id before SQL");
}
if (!/WHERE operating_company_id = \$1::uuid/.test(serviceText)) {
  fail("service must filter settlements by operating_company_id");
}
if (!serviceText.includes("l.operating_company_id = $1::uuid")) {
  fail("load aggregation must be company-scoped");
}
if (!routeText.includes("companyQuerySchema")) {
  fail("routes must require operating_company_id query contract");
}

console.log("verify:driver-settlement-tenant-scope — OK");
