#!/usr/bin/env node
import fs from "node:fs";

const service = fs.readFileSync("apps/backend/src/safety/fuel-gps-match.service.ts", "utf8");
const routes = fs.readFileSync("apps/backend/src/safety/fuel-gps-match.routes.ts", "utf8");
const required = [
  "WHERE bt.operating_company_id = $1::uuid",
  "WHERE v.operating_company_id = $1::uuid",
  "ON CONFLICT (operating_company_id, fuel_txn_id)",
  "set_config('app.operating_company_id'",
];
const missing = required.filter((snippet) => !service.includes(snippet) && !routes.includes(snippet));
if (missing.length > 0) {
  console.error("verify-fuel-match-tenant-scope failed");
  for (const snippet of missing) console.error(`  missing: ${snippet}`);
  process.exit(1);
}
console.log("verify-fuel-match-tenant-scope: ok");
