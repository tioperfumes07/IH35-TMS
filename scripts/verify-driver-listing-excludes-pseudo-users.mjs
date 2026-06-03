#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const driversRoutesPath = path.join(ROOT, "apps/backend/src/mdata/drivers.routes.ts");
const pseudoModulePath = path.join(ROOT, "apps/backend/src/mdata/driver-pseudo-user.ts");

function fail(message) {
  console.error(`verify:driver-listing-excludes-pseudo-users FAIL: ${message}`);
  process.exit(1);
}

for (const target of [driversRoutesPath, pseudoModulePath]) {
  if (!fs.existsSync(target)) fail(`missing ${path.relative(ROOT, target)}`);
}

const routesSrc = fs.readFileSync(driversRoutesPath, "utf8");
const pseudoSrc = fs.readFileSync(pseudoModulePath, "utf8");

if (!routesSrc.includes("EXCLUDE_PSEUDO_DRIVERS_SQL")) {
  fail("drivers list route must apply EXCLUDE_PSEUDO_DRIVERS_SQL for human-facing listings");
}

if (!routesSrc.includes("include_system: z.coerce.boolean()")) {
  fail("drivers list query schema must accept include_system");
}

if (!routesSrc.includes("include_system && !isOwnerOrAdmin")) {
  fail("include_system must be restricted to Owner/Administrator");
}

if (!pseudoSrc.includes("Safety Safety") || !pseudoSrc.includes("'safety', 'system'")) {
  fail("driver-pseudo-user module must define Safety/System exclusion predicates");
}

if (!pseudoSrc.includes("must NOT be deleted")) {
  fail("driver-pseudo-user module must document pseudo-user retention");
}

console.log("verify:driver-listing-excludes-pseudo-users PASS");
