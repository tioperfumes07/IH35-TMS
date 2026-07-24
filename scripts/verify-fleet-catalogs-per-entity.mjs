#!/usr/bin/env node
// verify:fleet-catalogs-per-entity
//
// Locks the LST fleet/asset per-entity conversion (owner ruling 2026-07-24: "lists and catalogs
// should be per entity, but we use the same catalog for all entities"). Migration 202607860000
// converts 8 GLOBAL fleet catalogs to per-entity; the shared fleet factory becomes companyScoped.
//
// This guard FAILS on the pre-fix tree (factory had no withCompanyScope / no operating_company_id in
// its INSERT; index.ts had no companyScoped flags; the migration did not exist; the count spec marked
// the 8 as companyScoped:false) and PASSES only when all of it is present and consistent.
//
// It deliberately does NOT check equipment_types / tire_positions — those stay GLOBAL and marking
// them scoped would 42703 the count. A future PR that converts equipment_types updates this list.
import { readFileSync } from "node:fs";

const LABEL = "verify:fleet-catalogs-per-entity";
const errs = [];
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    errs.push(`missing required file: ${p}`);
    return "";
  }
};

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

// 1) Migration present, held-marked, and encodes the per-entity conversion for all 8 tables.
const mig = read("db/migrations/202607860000_fleet_catalogs_per_entity.sql");
if (mig) {
  if (!/DO NOT RUN ON PROD/i.test(mig)) errs.push("migration 202607860000 is missing the 'DO NOT RUN ON PROD' held marker");
  if (!/ADD COLUMN IF NOT EXISTS operating_company_id uuid/.test(mig)) errs.push("migration must ADD operating_company_id to the fleet catalogs");
  if (!/FORCE ROW LEVEL SECURITY/.test(mig)) errs.push("migration must FORCE ROW LEVEL SECURITY on the converted catalogs");
  if (!/CREATE POLICY company_scope/.test(mig)) errs.push("migration must CREATE POLICY company_scope (the GUC entity-scope policy)");
  if (!/UNIQUE \(operating_company_id, code\)/.test(mig)) errs.push("migration must add the composite UNIQUE(operating_company_id, code)");
  if (!/REVOKE DELETE ON catalogs\.%I FROM ih35_app/.test(mig)) errs.push("migration must REVOKE DELETE (void-not-delete) on the converted catalogs");
  // Every one of the 8 table names must be named in the migration's table array.
  for (const t of PER_ENTITY) {
    if (!new RegExp(`'${t}'`).test(mig)) errs.push(`migration does not list catalog '${t}' in its conversion array`);
  }
  // Guard the seed intent: copy TRANSP rows to the other entities (same values), ON CONFLICT no-op.
  if (!/ON CONFLICT \(operating_company_id, code\) DO NOTHING/.test(mig)) errs.push("migration seed must be idempotent (ON CONFLICT (operating_company_id, code) DO NOTHING)");
}

// 2) Registered as held.
const held = read("db/migrations/.held-migrations.json");
if (held && !held.includes("202607860000_fleet_catalogs_per_entity.sql")) {
  errs.push("202607860000 is not registered in .held-migrations.json (a held migration must be tracked)");
}

// 3) The 8 fleet configs are companyScoped:true; equipment_types is NOT scoped (stays global).
const index = read("apps/backend/src/catalogs/fleet/index.ts");
if (index) {
  const scopedCount = (index.match(/companyScoped:\s*true/g) || []).length;
  if (scopedCount !== 8) errs.push(`fleet/index.ts must mark exactly 8 catalogs companyScoped:true (found ${scopedCount})`);
  // equipment_types block must NOT carry companyScoped:true. Bound the check to exactly that
  // createCatalogRoutes({...}) block (the nearest `createCatalogRoutes` before its displayName up to
  // the first `});` after) so a neighboring scoped block cannot cause a false hit.
  const eqAt = index.indexOf('"Equipment Types"');
  if (eqAt >= 0) {
    const blockStart = index.lastIndexOf("createCatalogRoutes", eqAt);
    const blockEnd = index.indexOf("});", eqAt);
    const eqBlock = index.slice(blockStart, blockEnd >= 0 ? blockEnd : eqAt);
    if (/companyScoped:\s*true/.test(eqBlock)) errs.push("equipment_types must stay GLOBAL (dual write-surface) — do not mark it companyScoped");
  }
}

// 4) The factory actually scopes by entity when companyScoped: uses withCompanyScope + writes
//    operating_company_id in the INSERT + filters reads by operating_company_id.
const factory = read("apps/backend/src/catalogs/fleet/factory.ts");
if (factory) {
  if (!/withCompanyScope/.test(factory)) errs.push("factory must use withCompanyScope for companyScoped catalogs (RLS GUC + membership)");
  if (!/companyScoped\s*===\s*true/.test(factory)) errs.push("factory must branch on config.companyScoped");
  if (!/INSERT INTO catalogs\.\$\{config\.tableName\} \(operating_company_id,/.test(factory))
    errs.push("factory scoped INSERT must write operating_company_id as the first column");
  if (!/operating_company_id = \$\{values\.length\}/.test(factory) && !/t\.operating_company_id = \$/.test(factory))
    errs.push("factory scoped reads/writes must filter by operating_company_id");
}

// 5) Count spec: the 8 are companyScoped:true, equipment_types + tire_positions stay false.
const spec = read("apps/backend/src/lists/lists-module-count-spec.ts");
if (spec) {
  const fleetBlock = spec.slice(spec.indexOf("fleet: ["), spec.indexOf("]", spec.indexOf("fleet: [")) + 1);
  for (const t of PER_ENTITY) {
    const line = fleetBlock.split("\n").find((l) => l.includes(`"${t}"`)) || "";
    if (!/companyScoped:\s*true/.test(line)) errs.push(`count spec: fleet.${t} must be companyScoped:true (converted to per-entity)`);
  }
  for (const t of ["equipment_types", "tire_positions"]) {
    const line = fleetBlock.split("\n").find((l) => l.includes(`"${t}"`)) || "";
    if (!/companyScoped:\s*false/.test(line)) errs.push(`count spec: fleet.${t} must stay companyScoped:false (still global — no operating_company_id)`);
  }
}

if (errs.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`${LABEL} OK — 8 fleet catalogs per-entity (migration + factory + index + count spec consistent).`);
