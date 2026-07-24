#!/usr/bin/env node
// verify:equipment-types-per-entity
//
// Locks the per-entity conversion of catalogs.equipment_types + its child
// catalogs.equipment_line_item_templates (owner ruling 2026-07-24; migration 202607880000). This is
// the DUAL-write-surface table: the fleet factory (companyScoped:true) AND the legacy
// /catalogs/equipment-types route — both are asserted here.
//
// FAILS on the pre-fix tree (legacy route wrote no operating_company_id / set no GUC; parent had no
// remap; migration absent) and PASSES only when all of it is present. `--selftest` plants each defect
// in an in-memory copy of the REAL sources and asserts every one is caught, then asserts live clean.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:equipment-types-per-entity";
const SELFTEST = process.argv.includes("--selftest");

const MIG = "db/migrations/202607910000_equipment_types_per_entity.sql";
const HELD = "db/migrations/.held-migrations.json";
const INDEX = "apps/backend/src/catalogs/fleet/index.ts";
const LEGACY = "apps/backend/src/catalogs/equipment-types.routes.ts";
const SPEC = "apps/backend/src/lists/lists-module-count-spec.ts";
const FILES = [MIG, HELD, INDEX, LEGACY, SPEC];

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertEquipmentTypesPerEntity(sources) {
  const get = (rel) => sources?.[rel] ?? readDisk(rel);
  const errs = [];

  const mig = get(MIG);
  if (!/DO NOT RUN ON PROD/i.test(mig)) errs.push("migration 202607880000 missing the 'DO NOT RUN ON PROD' held marker");
  if (!/ALTER TABLE catalogs\.equipment_types ADD COLUMN IF NOT EXISTS operating_company_id uuid/.test(mig)) errs.push("migration must ADD operating_company_id to equipment_types");
  if (!/ALTER TABLE catalogs\.equipment_line_item_templates ADD COLUMN IF NOT EXISTS operating_company_id uuid/.test(mig)) errs.push("migration must ADD operating_company_id to equipment_line_item_templates");
  if ((mig.match(/FORCE ROW LEVEL SECURITY/g) || []).length < 2) errs.push("migration must FORCE RLS on BOTH equipment_types and its templates");
  if (!/UNIQUE \(operating_company_id, code\)/.test(mig)) errs.push("migration must add UNIQUE(operating_company_id, code) on equipment_types");
  if ((mig.match(/REVOKE DELETE ON catalogs\.equipment/g) || []).length < 2) errs.push("migration must REVOKE DELETE on BOTH tables (void-not-delete)");
  // The child seed must REMAP onto the seed entity's own equipment_type (JOIN by code) — the crux.
  if (!/JOIN catalogs\.equipment_types et_seed\s+ON et_seed\.operating_company_id = v_seed AND et_seed\.code = et_pri\.code/.test(mig))
    errs.push("migration child seed must remap equipment_type_id onto the seed entity's own equipment_type (JOIN by code)");
  if (!/FROM org\.companies WHERE deactivated_at IS NULL AND id <> v_primary/.test(mig)) errs.push("migration must seed every OTHER active company dynamically from org.companies");

  if (!get(HELD).includes("202607910000_equipment_types_per_entity.sql")) errs.push("202607880000 is not registered in .held-migrations.json");

  // Fleet factory config: equipment_types is now companyScoped.
  const index = get(INDEX);
  const eqAt = index.indexOf('"Equipment Types"');
  if (eqAt >= 0) {
    const blockStart = index.lastIndexOf("createCatalogRoutes", eqAt);
    const blockEnd = index.indexOf("});", eqAt);
    const eqBlock = index.slice(blockStart, blockEnd >= 0 ? blockEnd : eqAt);
    if (!/companyScoped:\s*true/.test(eqBlock)) errs.push("fleet/index.ts equipment_types must be companyScoped:true (converted by 202607880000)");
  } else {
    errs.push("fleet/index.ts no longer registers Equipment Types");
  }

  // Count spec: equipment_types companyScoped:true.
  const spec = get(SPEC);
  const etLine = spec.split("\n").find((l) => l.includes('"equipment_types"')) || "";
  if (!/companyScoped:\s*true/.test(etLine)) errs.push("count spec: fleet.equipment_types must be companyScoped:true");

  // Legacy route scopes by entity: resolver + GUC + operating_company_id in BOTH inserts + parent check.
  const legacy = get(LEGACY);
  if (!/resolveOperatingCompanyId/.test(legacy)) errs.push("legacy equipment-types route must resolve the caller's company");
  if (!/set_config\('app\.operating_company_id'/.test(legacy)) errs.push("legacy equipment-types route must set the app.operating_company_id GUC");
  if (!/INSERT INTO catalogs\.equipment_types \(operating_company_id,/.test(legacy)) errs.push("legacy route equipment_types INSERT must write operating_company_id");
  if (!/INSERT INTO catalogs\.equipment_line_item_templates \(\s*operating_company_id,/.test(legacy)) errs.push("legacy route template INSERT must write operating_company_id");
  if (!/SELECT id FROM catalogs\.equipment_types WHERE id = \$1/.test(legacy)) errs.push("legacy add-line-item must verify the parent equipment_type is the caller's entity (RLS-scoped SELECT)");

  return errs;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((r) => [r, readDisk(r)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert`);
      return;
    }
    const problems = assertEquipmentTypesPerEntity(mutated);
    if (!problems.some((x) => x.includes(needle))) failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  expectCaught("legacy-guc-removed", { ...live, [LEGACY]: live[LEGACY].replace(/set_config\('app\.operating_company_id'/g, "set_config('app.other'") }, "set the app.operating_company_id GUC");
  expectCaught("legacy-et-insert-unscoped", { ...live, [LEGACY]: live[LEGACY].replace(/INSERT INTO catalogs\.equipment_types \(operating_company_id, /g, "INSERT INTO catalogs.equipment_types (") }, "equipment_types INSERT must write operating_company_id");
  expectCaught("legacy-parent-check-removed", { ...live, [LEGACY]: live[LEGACY].replace(/SELECT id FROM catalogs\.equipment_types WHERE id = \$1/g, "SELECT 1 WHERE true") }, "verify the parent equipment_type");
  expectCaught("mig-remap-removed", { ...live, [MIG]: live[MIG].replace(/JOIN catalogs\.equipment_types et_seed[\s\S]*?et_seed\.code = et_pri\.code/g, "CROSS JOIN (SELECT 1) et_seed_x") }, "remap equipment_type_id");
  expectCaught("mig-one-force-rls", { ...live, [MIG]: live[MIG].replace(/FORCE ROW LEVEL SECURITY/, "no rls once") }, "FORCE RLS on BOTH");

  const liveProblems = assertEquipmentTypesPerEntity(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertEquipmentTypesPerEntity();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — equipment_types + templates per-entity (migration remap + factory + legacy route consistent).`);
