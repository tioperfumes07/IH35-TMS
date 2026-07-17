#!/usr/bin/env node
/**
 * 0441-mod9-fleet-roster-no-create-actions
 *
 * Guards: /fleet (FleetHomePage) must expose + Create Unit / + Create Trailer
 * wired to POST /api/v1/mdata/units and POST /api/v1/mdata/equipment — not a
 * read-only roster with orphaned backends. Additive only; Lists catalog + Create
 * paths must remain untouched by this guard's expectations.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const paths = {
  home: path.join(ROOT, "apps/frontend/src/pages/fleet/FleetHomePage.tsx"),
  createUnit: path.join(ROOT, "apps/frontend/src/components/fleet/CreateUnitModal.tsx"),
  createTrailer: path.join(ROOT, "apps/frontend/src/components/fleet/CreateTrailerModal.tsx"),
  api: path.join(ROOT, "apps/frontend/src/api/mdata.ts"),
  unitsRoutes: path.join(ROOT, "apps/backend/src/mdata/units.routes.ts"),
  equipmentRoutes: path.join(ROOT, "apps/backend/src/mdata/equipment.routes.ts"),
  listsCatalog: path.join(ROOT, "apps/frontend/src/pages/lists/fleet/FleetCatalogListPage.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:fleet-roster-create-actions FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const failures = [];
  const home = read(paths.home);
  const createUnit = read(paths.createUnit);
  const createTrailer = read(paths.createTrailer);
  const api = read(paths.api);
  const unitsRoutes = read(paths.unitsRoutes);
  const equipmentRoutes = read(paths.equipmentRoutes);
  const listsCatalog = read(paths.listsCatalog);

  // Home must mount create CTAs + modals
  if (!home.includes("fleet-roster-create-actions")) {
    failures.push("FleetHomePage must expose create action bar (data-testid=fleet-roster-create-actions)");
  }
  if (!home.includes("+ Create Unit")) {
    failures.push("FleetHomePage must show + Create Unit CTA");
  }
  if (!home.includes("+ Create Trailer")) {
    failures.push("FleetHomePage must show + Create Trailer CTA");
  }
  if (/>\s*\+\s*New\s*</.test(home) || />\s*\+\s*Add\s*</.test(home)) {
    failures.push("FleetHomePage must not use + New or + Add vocabulary");
  }
  if (!home.includes("CreateUnitModal") || !home.includes("CreateTrailerModal")) {
    failures.push("FleetHomePage must mount CreateUnitModal and CreateTrailerModal");
  }
  if (!home.includes("FleetTablePage")) {
    failures.push("FleetHomePage must still mount FleetTablePage (additive create, not replace roster)");
  }

  // Unit modal → createUnit API
  if (!createUnit.includes("createUnit(") && !createUnit.includes("createUnit({")) {
    failures.push("CreateUnitModal must call createUnit(...)");
  }
  if (!createUnit.includes("fleet-create-unit-form")) {
    failures.push("CreateUnitModal must expose form (data-testid=fleet-create-unit-form)");
  }
  if (!createUnit.includes("unit_number") || !createUnit.includes("vin")) {
    failures.push("CreateUnitModal must collect unit_number and vin");
  }
  if (!createUnit.includes("+ Create")) {
    failures.push("CreateUnitModal submit must use + Create vocabulary");
  }
  if (/>\s*\+\s*New\s*</.test(createUnit) || />\s*\+\s*Add\s*</.test(createUnit)) {
    failures.push("CreateUnitModal must not use + New or + Add vocabulary");
  }

  // Trailer modal → createEquipment API
  if (!createTrailer.includes("createEquipment(") && !createTrailer.includes("createEquipment({")) {
    failures.push("CreateTrailerModal must call createEquipment(...)");
  }
  if (!createTrailer.includes("fleet-create-trailer-form")) {
    failures.push("CreateTrailerModal must expose form (data-testid=fleet-create-trailer-form)");
  }
  if (!createTrailer.includes("equipment_number") || !createTrailer.includes("equipment_type")) {
    failures.push("CreateTrailerModal must collect equipment_number and equipment_type");
  }
  if (!createTrailer.includes("+ Create")) {
    failures.push("CreateTrailerModal submit must use + Create vocabulary");
  }
  if (/>\s*\+\s*New\s*</.test(createTrailer) || />\s*\+\s*Add\s*</.test(createTrailer)) {
    failures.push("CreateTrailerModal must not use + New or + Add vocabulary");
  }

  // API helpers wired to canonical endpoints
  if (!/export function createUnit\b/.test(api)) {
    failures.push("mdata.ts must export createUnit");
  }
  if (!api.includes('"/api/v1/mdata/units"') || !/createUnit[\s\S]*?method:\s*"POST"/.test(api)) {
    failures.push("createUnit must POST /api/v1/mdata/units");
  }
  if (!/export function createEquipment\b/.test(api)) {
    failures.push("mdata.ts must export createEquipment");
  }
  if (!api.includes('"/api/v1/mdata/equipment"') || !/createEquipment[\s\S]*?method:\s*"POST"/.test(api)) {
    failures.push("createEquipment must POST /api/v1/mdata/equipment");
  }

  // Backend routes still present (do not regress to orphaned create)
  if (!unitsRoutes.includes('app.post("/api/v1/mdata/units"')) {
    failures.push("units.routes must keep POST /api/v1/mdata/units");
  }
  if (!equipmentRoutes.includes('app.post("/api/v1/mdata/equipment"')) {
    failures.push("equipment.routes must keep POST /api/v1/mdata/equipment");
  }

  // Additive: Lists fleet catalog + Create must remain
  if (!listsCatalog.includes("+ Create")) {
    failures.push("FleetCatalogListPage must retain + Create (never delete Lists create path)");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:fleet-roster-create-actions PASS");
}

main();
