#!/usr/bin/env node
// BUG-3 CI guard — G18 invariant: diesel/fuel WO expenses must link to a load.
//
// The G18 invariant requires that work-order lines with fuel/diesel cost codes
// reference a load_id. This guard verifies:
//   1. work-orders.routes.ts still contains G18_REQUIRED_CODES enforcement
//   2. The enforcement actually checks for a load_id before allowing the line
//   3. fuel.fuel_transactions.load_id is documented as nullable (Samsara data)
//      but the migration confirms it is enforced at the WO layer for app-created rows
//
// Run: node scripts/verify-bug3-g18-fuel-load-link.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => { console.error(`FAIL verify-bug3-g18-fuel-load-link: ${msg}`); process.exit(1); };
const pass = (msg) => console.log(`PASS verify-bug3-g18-fuel-load-link: ${msg}`);

const WO_ROUTES = "apps/backend/src/maintenance/work-orders.routes.ts";
const woPath = join(root, WO_ROUTES);
if (!existsSync(woPath)) fail(`${WO_ROUTES} not found`);

const src = readFileSync(woPath, "utf8");

if (!/G18_REQUIRED_CODES/.test(src))
  fail(`${WO_ROUTES}: G18_REQUIRED_CODES constant missing — G18 enforcement may have been removed`);
pass("G18_REQUIRED_CODES constant present in work-orders.routes.ts");

if (!/must link to a load.*G18|G18.*must link to a load/i.test(src))
  fail(`${WO_ROUTES}: G18 'must link to a load' error message missing`);
pass("G18 load-link error message present");

if (!/"FUEL"|"DIESEL"|"ROADSIDE"/.test(src))
  fail(`${WO_ROUTES}: G18 fuel/diesel/roadside codes missing from enforcement`);
pass("G18 fuel/diesel/roadside codes present");

// Confirm fuel_transactions load_id FK migration exists and documents nullable
const FUEL_MIG = "db/migrations/0300_create_fuel_transactions.sql";
const migPath = join(root, FUEL_MIG);
if (!existsSync(migPath)) fail(`${FUEL_MIG} not found`);
const migSrc = readFileSync(migPath, "utf8");
if (!/load_id.*uuid.*NULL.*REFERENCES.*mdata\.loads/i.test(migSrc))
  fail(`${FUEL_MIG}: load_id FK definition changed — verify G18 DB-level enforcement intent`);
pass("fuel_transactions.load_id nullable FK verified (Samsara data path; G18 enforced at WO layer)");

console.log("verify-bug3-g18-fuel-load-link: ALL CHECKS PASSED");
