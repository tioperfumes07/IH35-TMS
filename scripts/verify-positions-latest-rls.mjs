#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/telematics/positions.routes.ts"), "utf8");

if (!routes.includes("withCurrentUser")) {
  console.error("verify:positions-latest-rls FAIL: withCurrentUser missing from positions routes");
  process.exit(1);
}
if (!routes.includes("set_config('app.operating_company_id'")) {
  console.error("verify:positions-latest-rls FAIL: tenant GUC not set before query");
  process.exit(1);
}
if (!routes.includes("WHERE p.operating_company_id = $1::uuid")) {
  console.error("verify:positions-latest-rls FAIL: operating_company_id filter missing");
  process.exit(1);
}

console.log("verify:positions-latest-rls PASS");
