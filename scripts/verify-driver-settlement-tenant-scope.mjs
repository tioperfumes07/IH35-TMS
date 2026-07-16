#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const servicePath = path.join(process.cwd(), "apps/backend/src/payroll/driver-settlement.service.ts");
const deprecatedServicePath = path.join(process.cwd(), "apps/backend/src/payroll/driver-settlement.service.deprecated.ts");
const routesPath = path.join(process.cwd(), "apps/backend/src/payroll/driver-settlement.routes.ts");

function fail(message) {
  console.error(`verify:driver-settlement-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

// RETIREMENT-AWARE (settlement engine collapse Step 2, 2026-07-15): the payroll settlement engine was
// archived (driver-settlement.service.ts -> .deprecated.ts) and its routes 308-redirect to the canonical
// driver-finance subledger. When the live service no longer exists, this engine is retired and its
// tenant-scope contract is N/A — the RETIRE ledger is instead guarded by
// verify-no-payroll-settlement-writes.mjs (G4), which forbids new payroll.* settlement writes in live code.
if (!fs.existsSync(servicePath) && fs.existsSync(deprecatedServicePath)) {
  console.log(
    "verify:driver-settlement-tenant-scope — OK (payroll settlement engine RETIRED -> " +
      "driver-settlement.service.deprecated.ts; enforced by verify-no-payroll-settlement-writes.mjs G4)."
  );
  process.exit(0);
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
