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

  return failures;
}

function selftest() {
  const base = {
    home:
      'data-testid="fleet-roster-create-actions" + Create Unit + Create Trailer CreateUnitModal CreateTrailerModal FleetTablePage',
    createUnit:
      'createUnit({ unit_number, vin, currently_leased_to_company_id: operatingCompanyId }) fleet-create-unit-form + Create userFacingApiError(error, "Failed to create unit")',
    createTrailer:
      'createEquipment({ equipment_number, equipment_type, currently_leased_to_company_id: operatingCompanyId }) fleet-create-trailer-form + Create',
    api: `export function createUnit() { fetch("/api/v1/mdata/units", { method: "POST" }); }
export function createEquipment() { fetch("/api/v1/mdata/equipment", { method: "POST" }); }`,
    unitsRoutes: 'app.post("/api/v1/mdata/units"',
    equipmentRoutes: 'app.post("/api/v1/mdata/equipment"',
    listsCatalog: "+ Create",
  };

  const good = collectFailures(base);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL: well-formed fixtures must PASS, got:`);
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Planted failure: drop lease scope from CreateUnitModal payload → must FAIL
  const badUnit = collectFailures({
    ...base,
    createUnit: base.createUnit.replace(/currently_leased_to_company_id\s*:\s*operatingCompanyId,?/, ""),
  });
  if (!badUnit.some((f) => f.includes("CreateUnitModal") && f.includes("currently_leased_to_company_id"))) {
    console.error(
      `${LABEL} --selftest FAIL: removing currently_leased_to_company_id from CreateUnitModal must be caught`,
    );
    console.error(`  got: ${JSON.stringify(badUnit)}`);
    process.exit(1);
  }

  const rawErrorUnit = collectFailures({
    ...base,
    createUnit: base.createUnit.replace(
      /userFacingApiError\(error, "Failed to create unit"\)/,
      'error instanceof Error ? error.message : "Failed to create unit"',
    ),
  });
  if (!rawErrorUnit.some((f) => f.includes("raw backend errors"))) {
    console.error(`${LABEL} --selftest FAIL: raw CreateUnitModal backend error toast must be caught`);
    process.exit(1);
  }

  // Planted failure: drop lease scope from CreateTrailerModal payload → must FAIL
  const badTrailer = collectFailures({
    ...base,
    createTrailer: base.createTrailer.replace(
      /currently_leased_to_company_id\s*:\s*operatingCompanyId,?/,
      "",
    ),
  });
  if (
    !badTrailer.some((f) => f.includes("CreateTrailerModal") && f.includes("currently_leased_to_company_id"))
  ) {
    console.error(
      `${LABEL} --selftest FAIL: removing currently_leased_to_company_id from CreateTrailerModal must be caught`,
    );
    console.error(`  got: ${JSON.stringify(badTrailer)}`);
    process.exit(1);
  }

  console.log(
    `${LABEL} --selftest PASS (good fixtures clean; planted missing currently_leased_to_company_id fails for both modals)`,
  );
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
