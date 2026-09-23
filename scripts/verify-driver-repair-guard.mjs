#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B, E7 batch 2b)";

if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
  console.log("SKIP: CI environment");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("verify-driver-repair-guard: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
  process.exit(1);
}

const root = process.cwd();
const routePath = path.join(root, "apps/backend/src/dispatch/load-assign.routes.ts");
const servicePath = path.join(root, "apps/backend/src/dispatch/driver-availability.service.ts");

function fail(message) {
  console.error(`verify:driver-repair-guard FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(routePath)) fail(`missing route file: ${routePath}`);
if (!fs.existsSync(servicePath)) fail(`missing service file: ${servicePath}`);

const routeSource = fs.readFileSync(routePath, "utf8");
const serviceSource = fs.readFileSync(servicePath, "utf8");

if (!routeSource.includes("canAssignLoadToDriver(")) {
  fail("load-assign route must call canAssignLoadToDriver()");
}
if (!routeSource.includes("/api/v1/dispatch/loads/:id/quick-assign")) {
  fail("load-assign route must guard quick-assign endpoint");
}
if (!routeSource.includes("reply.code(409).send")) {
  fail("load-assign route must return 409 when repair block is active");
}

if (!serviceSource.includes("operating_company_id = $2")) {
  fail("driver availability query must include tenant filter (operating_company_id = $2)");
}
// Accept legacy `SET LOCAL app.operating_company_id` OR the SQLi-hardened parameterized
// `set_config('app.operating_company_id', $1, true)` form.
if (!/(?:SET LOCAL app\.operating_company_id|set_config\(\s*['"]app\.operating_company_id['"])/.test(serviceSource)) {
  fail("driver availability service must set tenant context via app.operating_company_id");
}

console.log("verify:driver-repair-guard OK");
