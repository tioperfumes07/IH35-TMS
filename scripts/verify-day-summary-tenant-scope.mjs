#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/backend/src/telematics/driver-day-summary.routes.ts";
const src = fs.readFileSync(target, "utf8");
const required = [
  "set_config('app.operating_company_id'",
  "WHERE v.operating_company_id = $1::uuid",
  "WHERE e.operating_company_id = $1::uuid",
  "WHERE ft.operating_company_id = $1::uuid",
  "WHERE sa.operating_company_id = $1::uuid",
];
const missing = required.filter((snippet) => !src.includes(snippet));
if (missing.length > 0) {
  console.error("verify-day-summary-tenant-scope failed");
  for (const snippet of missing) console.error(`  missing: ${snippet}`);
  process.exit(1);
}
console.log("verify-day-summary-tenant-scope: ok");
