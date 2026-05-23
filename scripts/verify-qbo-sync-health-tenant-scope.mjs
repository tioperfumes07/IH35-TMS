#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps", "backend", "src", "qbo", "sync-health.routes.ts");

function fail(message) {
  console.error(`verify:qbo-sync-health-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("apps/backend/src/qbo/sync-health.routes.ts not found");
}

const text = fs.readFileSync(TARGET, "utf8");
const routeMatch = text.match(/app\.get\("\/api\/v1\/qbo\/sync-health"[\s\S]*?\n  \}\);/m);
if (!routeMatch) {
  fail("could not locate /api/v1/qbo/sync-health route");
}

const routeBlock = routeMatch[0];
if (!/qbo\.sync_runs/.test(routeBlock) || !/operating_company_id\s*=\s*\$1::uuid/.test(routeBlock)) {
  fail("sync_runs query must filter by operating_company_id");
}
if (!/qbo\.sync_alerts/.test(routeBlock) || !/resolved_at IS NULL/.test(routeBlock)) {
  fail("sync_alerts query must be present and scoped for open alerts");
}
if (!/outbox\.events/.test(routeBlock) || !/payload->>'operating_company_id'/.test(routeBlock)) {
  fail("outbox.events query must scope by payload operating_company_id");
}

console.log("verify:qbo-sync-health-tenant-scope — OK");
