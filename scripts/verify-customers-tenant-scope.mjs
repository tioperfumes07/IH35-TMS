#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CUSTOMER_ROUTE_FILE = path.join(ROOT, "apps", "backend", "src", "mdata", "customers.routes.ts");

function fail(message) {
  console.error(`verify:customers-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(CUSTOMER_ROUTE_FILE)) {
  fail("apps/backend/src/mdata/customers.routes.ts not found");
}

const text = fs.readFileSync(CUSTOMER_ROUTE_FILE, "utf8");

const listRoute = text.match(/app\.get\("\/api\/v1\/mdata\/customers"[\s\S]*?\n  \}\);/m)?.[0] ?? "";
if (!listRoute) fail("could not locate customers list route");
if (!/set_config\('app\.operating_company_id'/.test(listRoute)) {
  fail("customers list route must set app.operating_company_id");
}
if (!/operating_company_id\s*=\s*\$\$\{values\.length\}/.test(listRoute)) {
  fail("customers list query must include operating_company_id filter");
}

const detailRoute = text.match(/app\.get\("\/api\/v1\/mdata\/customers\/:id"[\s\S]*?\n  \}\);/m)?.[0] ?? "";
if (!detailRoute) fail("could not locate customers detail route");
if (!/WHERE id = \$1 AND operating_company_id = \$2/.test(detailRoute)) {
  fail("customers detail query must include id + operating_company_id condition");
}

const detailExpandedRoute = text.match(/app\.get\("\/api\/v1\/mdata\/customers\/:id\/detail"[\s\S]*?\n  \}\);/m)?.[0] ?? "";
if (!detailExpandedRoute) fail("could not locate customers expanded detail route");
if (!/c\.operating_company_id = \$2/.test(detailExpandedRoute)) {
  fail("customers expanded detail query must include c.operating_company_id filter");
}

console.log("verify:customers-tenant-scope — OK");
