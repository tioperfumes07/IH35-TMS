#!/usr/bin/env node
/**
 * 0441-mod9-fleet-roster-no-create-actions
 *
 * Guards: /fleet (FleetHomePage) must expose + Create Unit / + Create Trailer
 * wired to POST /api/v1/mdata/units and POST /api/v1/mdata/equipment — not a
 * read-only roster with orphaned backends. Additive only; Lists catalog + Create
 * paths must remain untouched by this guard's expectations.
 *
 * Lease scoping: CreateUnitModal + CreateTrailerModal MUST send
 * currently_leased_to_company_id in the create payload so new assets appear
 * under the selected company (COALESCE(leased, owner) tenant filter). Dropping
 * that field → wrong-company roster fallthrough — plantable regression.
 *
 * Usage:
 *   node scripts/verify-fleet-roster-create-actions.mjs            # scan live sources
 *   node scripts/verify-fleet-roster-create-actions.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:fleet-roster-create-actions";

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
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

/** Pure assertions — used by live scan and --selftest planted fixtures. */
export function collectFailures({
  home,
  createUnit,
  createTrailer,
  api,
  unitsRoutes,
  equipmentRoutes,
  listsCatalog,
}) {
  const failures = [];

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

  // Unit modal → createUnit API + lease scope
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
  if (!/currently_leased_to_company_id\s*:/.test(createUnit)) {
    failures.push(
      "CreateUnitModal create payload must include currently_leased_to_company_id (lease scope for roster tenant filter)",
    );
  }
  if (!/userFacingApiError\(\s*error\s*,\s*"Failed to create unit"\s*\)/.test(createUnit)) {
    failures.push("CreateUnitModal must not expose raw backend errors in its failure toast");
  }

  // Trailer modal → createEquipment API + lease scope
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
  if (!/currently_leased_to_company_id\s*:/.test(createTrailer)) {
    failures.push(
      "CreateTrailerModal create payload must include currently_leased_to_company_id (lease scope for roster tenant filter)",
    );
  }
  if (!/userFacingApiError\(\s*error\s*,\s*"Failed to create trailer"\s*\)/.test(createTrailer)) {
    failures.push("CreateTrailerModal must not expose raw backend errors in its failure toast");
  }

  // API helpers wired to canonical endpoints
  if (!/export function createUnit\b[^{]*\{\s*return apiRequest<[^>]+>\("\/api\/v1\/mdata\/units", \{ method: "POST", body \}\);\s*\}/.test(api)) {
    failures.push("createUnit must POST /api/v1/mdata/units");
  }
  if (!/export function createEquipment\b[^{]*\{\s*return apiRequest<[^>]+>\("\/api\/v1\/mdata\/equipment", \{ method: "POST", body \}\);\s*\}/.test(api)) {
    failures.push("createEquipment must POST /api/v1/mdata/equipment");
  }

  // Backend routes still present (do not regress to orphaned create)
  if (!/app\.post\(\s*"\/api\/v1\/mdata\/units"/.test(unitsRoutes)) {
    failures.push("units.routes must keep POST /api/v1/mdata/units");
  }
  if (!/app\.post\(\s*"\/api\/v1\/mdata\/equipment"/.test(equipmentRoutes)) {
    failures.push("equipment.routes must keep POST /api/v1/mdata/equipment");
  }

  // Additive: Lists fleet catalog + Create must remain
  if (!listsCatalog.includes("+ Create")) {
    failures.push("FleetCatalogListPage must retain + Create (never delete Lists create path)");
  }

  return failures;
}

function selftest() {
  const base = {
    home:
      'data-testid="fleet-roster-create-actions" + Create Unit + Create Trailer CreateUnitModal CreateTrailerModal FleetTablePage',
    createUnit:
      'createUnit({ unit_number, vin, currently_leased_to_company_id: operatingCompanyId }) fleet-create-unit-form + Create userFacingApiError(error, "Failed to create unit")',
    createTrailer:
      'createEquipment({ equipment_number, equipment_type, currently_leased_to_company_id: operatingCompanyId }) fleet-create-trailer-form + Create userFacingApiError(error, "Failed to create trailer")',
    api: `export function createUnit(body: CreateUnitInput) { return apiRequest<MdataUnit>("/api/v1/mdata/units", { method: "POST", body }); }
export function createEquipment(body: CreateEquipmentInput) { return apiRequest<MdataEquipment>("/api/v1/mdata/equipment", { method: "POST", body }); }`,
    unitsRoutes: 'app.post("/api/v1/mdata/units"',
    equipmentRoutes: 'app.post("/api/v1/mdata/equipment"',
    listsCatalog: "+ Create",
  };

  const goodFailures = collectFailures(base);
  if (goodFailures.length) {
    console.error(`${LABEL} --selftest FAIL: well-formed fixtures must PASS, got:`);
    for (const f of goodFailures) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    ["home", "fleet-roster-create-actions", "roster-create-actions"],
    ["home", "+ Create Unit", "show + Create Unit"],
    ["home", "+ Create Trailer", "show + Create Trailer"],
    ["home", "CreateUnitModal", "mount CreateUnitModal"],
    ["home", "CreateTrailerModal", "mount CreateUnitModal and CreateTrailerModal"],
    ["home", "FleetTablePage", "still mount FleetTablePage"],
    ["createUnit", "createUnit({", "call createUnit"],
    ["createUnit", "fleet-create-unit-form", "expose form"],
    ["createUnit", "unit_number", "collect unit_number and vin"],
    ["createUnit", "currently_leased_to_company_id: operatingCompanyId", "currently_leased_to_company_id"],
    ["createUnit", 'userFacingApiError(error, "Failed to create unit")', "raw backend errors"],
    ["createTrailer", "createEquipment({", "call createEquipment"],
    ["createTrailer", "fleet-create-trailer-form", "expose form"],
    ["createTrailer", "equipment_number", "collect equipment_number and equipment_type"],
    ["createTrailer", "currently_leased_to_company_id: operatingCompanyId", "currently_leased_to_company_id"],
    ["createTrailer", 'userFacingApiError(error, "Failed to create trailer")', "raw backend errors"],
    ["api", '"/api/v1/mdata/units"', "createUnit must POST"],
    ["api", '"/api/v1/mdata/equipment"', "createEquipment must POST"],
    ["unitsRoutes", 'app.post("/api/v1/mdata/units"', "units.routes must keep POST"],
    ["equipmentRoutes", 'app.post("/api/v1/mdata/equipment"', "equipment.routes must keep POST"],
    ["listsCatalog", "+ Create", "retain + Create"],
  ];

  for (const [field, token, expected] of mutations) {
    const mutated = { ...base, [field]: base[field].replace(token, "REMOVED_BY_SELFTEST") };
    const failures = collectFailures(mutated);
    if (!failures.some((failure) => failure.includes(expected))) {
      console.error(`${LABEL} --selftest FAIL: mutation ${field}:${token} escaped; got ${JSON.stringify(failures)}`);
      process.exit(1);
    }
  }

  console.log(`${LABEL} --selftest PASS — ${mutations.length}/${mutations.length} create-action/API/backend/scope/error/List defects detected`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const failures = collectFailures({
    home: read(paths.home),
    createUnit: read(paths.createUnit),
    createTrailer: read(paths.createTrailer),
    api: read(paths.api),
    unitsRoutes: read(paths.unitsRoutes),
    equipmentRoutes: read(paths.equipmentRoutes),
    listsCatalog: read(paths.listsCatalog),
  });

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log(`${LABEL} PASS`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) main();
