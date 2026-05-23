#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps", "backend", "src", "reports", "library.routes.ts");

function fail(message) {
  console.error(`verify:home-attention-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("apps/backend/src/reports/library.routes.ts not found");
}

const text = fs.readFileSync(TARGET, "utf8");
const routeMatch = text.match(/app\.get\("\/api\/v1\/reports\/home-attention-list"[\s\S]*?\n  \}\);/m);
if (!routeMatch) {
  fail("could not locate /api/v1/reports/home-attention-list route");
}

const routeBlock = routeMatch[0];

if (!/set_config\('app\.operating_company_id'/.test(routeBlock)) {
  fail("route must set app.operating_company_id tenant context");
}

if (!/current_setting\('app\.operating_company_id', true\)::uuid/.test(routeBlock)) {
  fail("route queries must scope by current_setting('app.operating_company_id')");
}

if (!/dispatch\.loads|mdata\.loads/.test(routeBlock)) {
  fail("attention list must source dispatch/mdata loads");
}

if (!/maintenance\.work_orders/.test(routeBlock)) {
  fail("attention list must source maintenance.work_orders");
}

if (!/safety\./.test(routeBlock)) {
  fail("attention list must source safety domain data");
}

if (!/views\.ap_aging|accounting\./.test(routeBlock) || !/views\.ar_aging|accounting\./.test(routeBlock)) {
  fail("attention list must source accounting overdue data");
}

if (!/type:\s*"dispatch_loads_in_flight_late"/.test(routeBlock)) {
  fail("route must return normalized typed items, not generic message fixtures");
}

if (/message:\s*"/.test(routeBlock) || /link:\s*"/.test(routeBlock)) {
  fail("response shape must avoid legacy hardcoded message/link fixtures");
}

console.log("verify:home-attention-tenant-scope — OK");
