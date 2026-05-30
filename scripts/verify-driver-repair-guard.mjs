#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
  console.log("SKIP: CI environment");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.log("SKIP: DATABASE_URL not set");
  process.exit(0);
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
if (!serviceSource.includes("SET LOCAL app.operating_company_id")) {
  fail("driver availability service must set tenant context via app.operating_company_id");
}

console.log("verify:driver-repair-guard OK");
