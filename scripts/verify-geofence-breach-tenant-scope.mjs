#!/usr/bin/env node
import fs from "node:fs";

const routes = fs.readFileSync("apps/backend/src/safety/geofence-breach.routes.ts", "utf8");
const cron = fs.readFileSync("apps/backend/src/cron/geofence-breach-detector.cron.ts", "utf8");

const requiredSnippets = [
  "assertTenantContext(operatingCompanyId, \"safety.geofence_breach_cron\")",
  "assertTenantContext(company.id, \"safety.geofence_breach_cron\")",
  "set_config('app.operating_company_id'",
  "WHERE g.operating_company_id = $1::uuid",
  "WHERE v.operating_company_id = $1::uuid",
];

const missing = requiredSnippets.filter((snippet) => !routes.includes(snippet) && !cron.includes(snippet));

if (missing.length > 0) {
  console.error("verify-geofence-breach-tenant-scope failed");
  for (const snippet of missing) {
    console.error(`  missing: ${snippet}`);
  }
  process.exit(1);
}

console.log("verify-geofence-breach-tenant-scope: ok");
