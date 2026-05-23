#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) throw new Error(`missing file: ${relPath}`);
  return fs.readFileSync(full, "utf8");
}

function fail(lines) {
  console.error("verify:hos-clocks-tenant-scope — FAILED");
  for (const line of lines) console.error(`- ${line}`);
  process.exit(1);
}

const failures = [];
let service = "";
let routes = "";
let dispatchRoutes = "";
try {
  service = read("apps/backend/src/telematics/hos-clocks.service.ts");
  routes = read("apps/backend/src/telematics/hos.routes.ts");
  dispatchRoutes = read("apps/backend/src/dispatch/loads.routes.ts");
} catch (error) {
  fail([String(error instanceof Error ? error.message : error)]);
}

if (!service.includes("FROM hos.duty_status_events e")) {
  failures.push("apps/backend/src/telematics/hos-clocks.service.ts: service must read hos.duty_status_events");
}
if (!service.includes("e.operating_company_id = $1::uuid") || !service.includes("e.driver_id = $2::uuid")) {
  failures.push("apps/backend/src/telematics/hos-clocks.service.ts: duty events query must be tenant-scoped by company and driver");
}
if (!routes.includes("set_config('app.operating_company_id'")) {
  failures.push("apps/backend/src/telematics/hos.routes.ts: routes must set tenant context");
}
if (!routes.includes("WHERE id = $1::uuid") || !routes.includes("operating_company_id = $2::uuid")) {
  failures.push("apps/backend/src/telematics/hos.routes.ts: driver lookup must enforce tenant scope");
}
if (!dispatchRoutes.includes("getCurrentClocks(client, operatingCompanyId")) {
  failures.push("apps/backend/src/dispatch/loads.routes.ts: dispatch hos endpoint must use HOS clock service");
}

if (failures.length > 0) fail(failures);
console.log("verify:hos-clocks-tenant-scope — OK");
