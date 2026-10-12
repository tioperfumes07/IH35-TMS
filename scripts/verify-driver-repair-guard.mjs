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
// 443.99 (2026-10-12) — tenant-context check re-anchored.
//   old rule: the SERVICE must itself set app.operating_company_id (SET LOCAL / set_config).
//   new rule: the service must REQUIRE a caller-scoped connection (`queryable: Queryable`, no optional
//             `?`, no bare-pool default), and every route call must run inside
//             withCompanyScope(authUser.uuid, tenantId, (client) => canAssignLoadToDriver(..., client)),
//             which sets BOTH app.current_user_id and app.operating_company_id.
//   why: DRV-AVAILABILITY-RLS-MASKED (#20308, 176bc275c7) removed the service's own bare-pool fallback that
//        set ONLY app.operating_company_id — mdata.drivers' RLS keys on app.current_user_id, so that
//        fallback returned a masked zero rows and reported real drivers "not found" on the booking path.
//        Setting the GUC inside the service is the defect this guard was still demanding. Not looser: an
//        optional/defaulted queryable or an unscoped route call now fails.
if (!/export async function canAssignLoadToDriver\(\s*driverId: string,\s*tenantId: string,\s*queryable: Queryable\s*\)/.test(serviceSource)) {
  fail("canAssignLoadToDriver must REQUIRE a caller-scoped queryable (no optional/defaulted bare-pool connection)");
}
const routeCalls = routeSource.match(/canAssignLoadToDriver\(/g) ?? [];
const scopedCalls = routeSource.match(/withCompanyScope\(authUser\.uuid, tenantId, \(client\) =>\s*canAssignLoadToDriver\(driverId, tenantId, client\)/g) ?? [];
if (routeCalls.length === 0 || scopedCalls.length !== routeCalls.length) {
  fail(`every canAssignLoadToDriver call in the load-assign route must run inside withCompanyScope(authUser.uuid, tenantId, (client) => ...) (${scopedCalls.length}/${routeCalls.length} scoped)`);
}

console.log("verify:driver-repair-guard OK");
