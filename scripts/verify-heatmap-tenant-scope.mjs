#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/backend/src/telematics/heatmap.routes.ts";
const src = fs.readFileSync(target, "utf8");
const required = [
  "set_config('app.operating_company_id'",
  "WHERE v.operating_company_id = $1::uuid",
  "AND v.captured_at >= $2::timestamptz",
  "AND v.captured_at <= $3::timestamptz",
];
const missing = required.filter((snippet) => !src.includes(snippet));
if (missing.length > 0) {
  console.error("verify-heatmap-tenant-scope failed");
  for (const snippet of missing) console.error(`  missing: ${snippet}`);
  process.exit(1);
}
console.log("verify-heatmap-tenant-scope: ok");
