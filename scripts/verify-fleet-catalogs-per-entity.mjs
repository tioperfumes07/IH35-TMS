#!/usr/bin/env node
// verify:fleet-catalogs-per-entity
//
// Locks the LST fleet/asset per-entity conversion (owner ruling 2026-07-24: "lists and catalogs
// should be per entity, but we use the same catalog for all entities"). Migration 202607860000
// converts 8 GLOBAL fleet catalogs to per-entity; the shared fleet factory becomes companyScoped.
//
// FAILS on the pre-fix tree (factory had no withCompanyScope / no operating_company_id INSERT; index
// had no companyScoped flags; the migration did not exist; the count spec marked the 8 false) and
// PASSES only when all of it is present and consistent. `--selftest` plants each defect in an
// in-memory copy of the REAL sources and asserts every one is caught (non-inert), then asserts the
// live tree is clean.
//
// Deliberately does NOT touch equipment_types / tire_positions — those stay GLOBAL (marking them
// scoped would 42703 the count). A future PR that converts equipment_types updates this guard.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:fleet-catalogs-per-entity";
const SELFTEST = process.argv.includes("--selftest");

const MIG = "db/migrations/202607860000_fleet_catalogs_per_entity.sql";
const HELD = "db/migrations/.held-migrations.json";
const INDEX = "apps/backend/src/catalogs/fleet/index.ts";
const FACTORY = "apps/backend/src/catalogs/fleet/factory.ts";
const SPEC = "apps/backend/src/lists/lists-module-count-spec.ts";
const FILES = [MIG, HELD, INDEX, FACTORY, SPEC];

const PER_ENTITY = [
  "asset_condition_codes",
  "asset_locations",
  "asset_statuses",
  "unit_ownership_types",
  "trailer_types",
  "lease_terms",
  "tractor_statuses",
  "trailer_statuses",
];

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertFleetPerEntity(sources) {
  const get = (rel) => sources?.[rel] ?? readDisk(rel);
  const errs = [];

  // 1) Migration encodes the per-entity conversion for all 8 tables.
  const mig = get(MIG);
  if (!/DO NOT RUN ON PROD/i.test(mig)) errs.push("migration 202607860000 is missing the 'DO NOT RUN ON PROD' held marker");
  if (!/ADD COLUMN IF NOT EXISTS operating_company_id uuid/.test(mig)) errs.push("migration must ADD operating_company_id to the fleet catalogs");
  if (!/FORCE ROW LEVEL SECURITY/.test(mig)) errs.push("migration must FORCE ROW LEVEL SECURITY on the converted catalogs");
  if (!/CREATE POLICY company_scope/.test(mig)) errs.push("migration must CREATE POLICY company_scope (the GUC entity-scope policy)");
  if (!/UNIQUE \(operating_company_id, code\)/.test(mig)) errs.push("migration must add the composite UNIQUE(operating_company_id, code)");
  if (!/REVOKE DELETE ON catalogs\.%I FROM ih35_app/.test(mig)) errs.push("migration must REVOKE DELETE (void-not-delete) on the converted catalogs");
  if (!/ON CONFLICT \(operating_company_id, code\) DO NOTHING/.test(mig)) errs.push("migration seed must be idempotent (ON CONFLICT (operating_company_id, code) DO NOTHING)");
  // Entities must be resolved dynamically from org.companies (never hardcoded → fresh-DB FK violation).
  if (/USING v_transp\b/.test(mig) || /ARRAY\[v_usmca, v_trk\]/.test(mig)) errs.push("migration must resolve entities dynamically from org.companies, not hardcoded UUIDs (fresh-DB FK)");
  for (const t of PER_ENTITY) {
    if (!new RegExp(`'${t}'`).test(mig)) errs.push(`migration does not list catalog '${t}' in its conversion array`);
  }

  // 2) Registered as held.
  if (!get(HELD).includes("202607860000_fleet_catalogs_per_entity.sql")) errs.push("202607860000 is not registered in .held-migrations.json");

  // 3) The 8 fleet configs are companyScoped:true; equipment_types is NOT scoped.
  const index = get(INDEX);
  const scopedCount = (index.match(/companyScoped:\s*true/g) || []).length;
  if (scopedCount !== 8) errs.push(`fleet/index.ts must mark exactly 8 catalogs companyScoped:true (found ${scopedCount})`);
  const eqAt = index.indexOf('"Equipment Types"');
  if (eqAt >= 0) {
    const blockStart = index.lastIndexOf("createCatalogRoutes", eqAt);
    const blockEnd = index.indexOf("});", eqAt);
    const eqBlock = index.slice(blockStart, blockEnd >= 0 ? blockEnd : eqAt);
    if (/companyScoped:\s*true/.test(eqBlock)) errs.push("equipment_types must stay GLOBAL (dual write-surface) — do not mark it companyScoped");
  }

  // 4) The factory scopes by entity when companyScoped.
  const factory = get(FACTORY);
  if (!/withCompanyScope/.test(factory)) errs.push("factory must use withCompanyScope for companyScoped catalogs (RLS GUC + membership)");
  if (!/companyScoped\s*===\s*true/.test(factory)) errs.push("factory must branch on config.companyScoped");
  if (!/INSERT INTO catalogs\.\$\{config\.tableName\} \(operating_company_id,/.test(factory)) errs.push("factory scoped INSERT must write operating_company_id as the first column");

  // 5) Count spec: the 8 are companyScoped:true, equipment_types + tire_positions stay false.
  const spec = get(SPEC);
  const fleetBlock = spec.slice(spec.indexOf("fleet: ["), spec.indexOf("]", spec.indexOf("fleet: [")) + 1);
  for (const t of PER_ENTITY) {
    const line = fleetBlock.split("\n").find((l) => l.includes(`"${t}"`)) || "";
    if (!/companyScoped:\s*true/.test(line)) errs.push(`count spec: fleet.${t} must be companyScoped:true (converted to per-entity)`);
  }
  for (const t of ["equipment_types", "tire_positions"]) {
    const line = fleetBlock.split("\n").find((l) => l.includes(`"${t}"`)) || "";
    if (!/companyScoped:\s*false/.test(line)) errs.push(`count spec: fleet.${t} must stay companyScoped:false (still global)`);
  }

  return errs;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((r) => [r, readDisk(r)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert (mutation did not change any source)`);
      return;
    }
    const problems = assertFleetPerEntity(mutated);
    if (!problems.some((x) => x.includes(needle))) failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  expectCaught("factory-scope-removed", { ...live, [FACTORY]: live[FACTORY].replace(/withCompanyScope/g, "withPlainScope") }, "withCompanyScope");
  expectCaught("index-flags-flipped", { ...live, [INDEX]: live[INDEX].replace(/companyScoped:\s*true/g, "companyScoped: false") }, "exactly 8 catalogs companyScoped:true");
  expectCaught("spec-flag-flipped", { ...live, [SPEC]: live[SPEC].replace('{ table: "asset_statuses", activeFilter: "is_active", companyScoped: true }', '{ table: "asset_statuses", activeFilter: "is_active", companyScoped: false }') }, "fleet.asset_statuses must be companyScoped:true");
  expectCaught("mig-force-rls-removed", { ...live, [MIG]: live[MIG].replace(/FORCE ROW LEVEL SECURITY/g, "no rls") }, "FORCE ROW LEVEL SECURITY");
  expectCaught("mig-hardcoded-uuid", { ...live, [MIG]: live[MIG].replace("SELECT id FROM org.companies WHERE deactivated_at IS NULL AND id <> v_primary", "unnest(ARRAY[v_usmca, v_trk])") }, "resolve entities dynamically");

  const liveProblems = assertFleetPerEntity(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertFleetPerEntity();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — 8 fleet catalogs per-entity (migration + factory + index + count spec consistent).`);
