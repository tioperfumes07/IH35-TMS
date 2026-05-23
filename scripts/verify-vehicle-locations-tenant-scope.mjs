#!/usr/bin/env node
import fs from "node:fs";

const servicePath = "apps/backend/src/telematics/vehicle-locations.service.ts";
const routesPath = "apps/backend/src/telematics/positions.routes.ts";
const service = fs.readFileSync(servicePath, "utf8");
const routes = fs.readFileSync(routesPath, "utf8");

const required = [
  "ON CONFLICT (operating_company_id, raw_samsara_event_id) DO NOTHING",
  "operating_company_id",
  "set_config('app.operating_company_id'",
  "WHERE operating_company_id = $1::uuid",
];

const missing = required.filter((snippet) => !service.includes(snippet) && !routes.includes(snippet));
if (missing.length > 0) {
  console.error("verify-vehicle-locations-tenant-scope failed");
  for (const snippet of missing) console.error(`  missing: ${snippet}`);
  process.exit(1);
}

console.log("verify-vehicle-locations-tenant-scope: ok");
