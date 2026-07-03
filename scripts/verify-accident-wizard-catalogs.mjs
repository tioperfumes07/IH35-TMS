#!/usr/bin/env node
// BLOCK SC1 — static guard.
//
// Locks the fix for the "dead accident catalogs" defect: the Accident Report wizard's
// Driver / Unit / Repair Vendor / Load fields were bare free-text <input>s with no data source
// (typing fired zero API calls, rendered zero options — reports could not key to a real
// driver/unit/vendor/load record). This guard fails if any of the four fields regresses to a
// free-text input, or if the wizard stops importing the real catalog list functions.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const TAG = "[verify-accident-wizard-catalogs]";
const DRAWER = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";

function fail(msg) {
  console.error(`${TAG} FAIL: ${msg}`);
  process.exit(1);
}

const ROUTES = "apps/backend/src/safety/safety.routes.ts";

const abs = path.join(repoRoot, DRAWER);
if (!fs.existsSync(abs)) fail(`accident wizard component missing: ${DRAWER}`);
const src = fs.readFileSync(abs, "utf8");

// 1) The wizard must source its catalogs from the real, company-scoped list functions.
for (const fn of ["listDrivers", "listUnits", "listVendors"]) {
  if (!src.includes(fn)) fail(`${DRAWER} no longer imports/uses ${fn} — the ${fn} catalog is dead again`);
}
// Load picker uses the dispatch loads list.
if (!src.includes("listDispatchLoads")) {
  fail(`${DRAWER} no longer uses listDispatchLoads — the Load catalog is dead again`);
}

// 2) Each of the four fields must render through a real picker (data-testid marker present).
const requiredPickers = [
  "accident-driver-picker",
  "accident-unit-picker",
  "accident-vendor-picker",
  "accident-load-picker",
];
for (const testid of requiredPickers) {
  if (!src.includes(testid)) fail(`${DRAWER} missing picker marker "${testid}" — a catalog field regressed to no data source`);
}

// 3) No free-text persistence of the linked ids: the driver/unit fields must NOT bind a bare
//    <input defaultValue={String(accident.driver_id ...)} / accident.unit_id — the exact pre-fix
//    dead pattern. The id must flow through the Combobox picker (state), not a typed string.
const deadPatterns = [
  /<input[^>]*defaultValue=\{String\(accident\.driver_id/,
  /<input[^>]*defaultValue=\{String\(accident\.unit_id/,
];
for (const pattern of deadPatterns) {
  if (pattern.test(src)) fail(`${DRAWER} still binds a linked id to a free-text <input> (${pattern}) — pickers must own the id`);
}

// 4) The office creator persists the links: the drawer must call the create endpoint helper.
if (!src.includes("createSafetyAccident")) {
  fail(`${DRAWER} no longer calls createSafetyAccident — office-created reports would not persist the links`);
}

// 5) Backend: the accident create endpoint must INSERT the three link columns into
//    safety.accident_reports AND emit a spine audit event on the mutation (audit-emit invariant).
const routesAbs = path.join(repoRoot, ROUTES);
if (!fs.existsSync(routesAbs)) fail(`safety routes missing: ${ROUTES}`);
const routes = fs.readFileSync(routesAbs, "utf8");

if (!/app\.post\(\s*["'`]\/api\/v1\/safety\/accidents["'`]/.test(routes)) {
  fail(`${ROUTES} missing POST /api/v1/safety/accidents (office creator endpoint)`);
}
const insertMatch = routes.match(/INSERT\s+INTO\s+safety\.accident_reports[\s\S]*?RETURNING/i);
if (!insertMatch) fail(`${ROUTES} has no INSERT INTO safety.accident_reports — office creator does not persist`);
for (const col of ["unit_id", "vendor_id", "load_id"]) {
  if (!insertMatch[0].includes(col)) fail(`${ROUTES} accident INSERT does not persist ${col} link`);
}
if (!routes.includes("appendCrudAudit") || !routes.includes("safety.accident.created")) {
  fail(`${ROUTES} accident create does not emit a spine audit event (safety.accident.created)`);
}

// 6) The additive migration must add the three link columns to safety.accident_reports.
const migDir = path.join(repoRoot, "db/migrations");
const migFiles = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")) : [];
const hasLinkMigration = migFiles.some((f) => {
  const body = fs.readFileSync(path.join(migDir, f), "utf8");
  return (
    body.includes("safety.accident_reports") &&
    /ADD COLUMN IF NOT EXISTS\s+unit_id/i.test(body) &&
    /ADD COLUMN IF NOT EXISTS\s+vendor_id/i.test(body) &&
    /ADD COLUMN IF NOT EXISTS\s+load_id/i.test(body)
  );
});
if (!hasLinkMigration) {
  fail("no migration adds unit_id/vendor_id/load_id (ADD COLUMN IF NOT EXISTS) to safety.accident_reports");
}

console.log(`${TAG} OK — catalogs wired to real pickers; office creator persists driver/unit/vendor/load links with audit emit + additive migration.`);
