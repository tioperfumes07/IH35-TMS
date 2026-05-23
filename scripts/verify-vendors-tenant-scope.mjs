#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VENDOR_ROUTE_FILE = path.join(ROOT, "apps", "backend", "src", "mdata", "vendors.routes.ts");

function fail(message) {
  console.error(`verify:vendors-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(VENDOR_ROUTE_FILE)) {
  fail("apps/backend/src/mdata/vendors.routes.ts not found");
}

const text = fs.readFileSync(VENDOR_ROUTE_FILE, "utf8");

const listRoute = text.match(/app\.get\("\/api\/v1\/mdata\/vendors"[\s\S]*?\n  \}\);/m)?.[0] ?? "";
if (!listRoute) fail("could not locate vendors list route");
if (!/set_config\('app\.operating_company_id'/.test(listRoute)) {
  fail("vendors list route must set app.operating_company_id");
}
if (!/operating_company_id\s*=\s*\$\$\{values\.length\}/.test(listRoute)) {
  fail("vendors list query must include operating_company_id filter");
}

const detailRoute = text.match(/app\.get\("\/api\/v1\/mdata\/vendors\/:id"[\s\S]*?\n  \}\);/m)?.[0] ?? "";
if (!detailRoute) fail("could not locate vendors detail route");
if (!/WHERE id = \$1[\s\S]*operating_company_id = \$2/.test(detailRoute)) {
  fail("vendors detail query must include id + operating_company_id condition");
}

console.log("verify:vendors-tenant-scope — OK");
