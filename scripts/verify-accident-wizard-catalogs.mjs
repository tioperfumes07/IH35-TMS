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

console.log(`${TAG} OK — Driver/Unit/Vendor/Load catalogs wired to real pickers, no free-text id binding.`);
