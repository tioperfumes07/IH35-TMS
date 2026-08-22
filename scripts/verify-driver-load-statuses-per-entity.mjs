#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.drivers.driver_load_statuses.list","catalog.drivers.driver_load_statuses.create"],"task":"LISTS-F5962-DRIVER-LOAD-STATUS-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
// verify:driver-load-statuses-per-entity
//
// Locks the per-entity conversion of catalogs.driver_load_statuses (owner ruling 2026-07-24, companion
// to the fleet 8 in 202607860000). Migration 202607870000 makes it per-entity; its route + the catalog
// registry read scope by the caller's company GUC.
//
// FAILS on the pre-fix tree (route used no operating_company_id / no set_config; registry set no GUC;
// migration absent) and PASSES only when all of it is present. `--selftest` plants each defect in an
// in-memory copy of the REAL sources and asserts every one is caught, then asserts the live tree clean.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:driver-load-statuses-per-entity";
const SELFTEST = process.argv.includes("--selftest");

const MIG = "db/migrations/202607870000_driver_load_statuses_per_entity.sql";
const HELD = "db/migrations/.held-migrations.json";
const ROUTE = "apps/backend/src/catalogs/driver-load-statuses.routes.ts";
const REGISTRY = "apps/backend/src/catalogs/catalog-registry.routes.ts";
const API = "apps/frontend/src/api/catalogs.ts";
const PAGE = "apps/frontend/src/pages/DriverLoadStatusesPage.tsx";
const MATRIX = "docs/specs/scoreboard/modules/lists.required.json";
const FILES = [MIG, HELD, ROUTE, REGISTRY, API, PAGE, MATRIX];

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertDriverLoadStatusesPerEntity(sources) {
  const get = (rel) => sources?.[rel] ?? readDisk(rel);
  const errs = [];

  let matrix;
  try { matrix = JSON.parse(get(MATRIX)); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  for (const suffix of ["list", "create"]) {
    const id = `catalog.drivers.driver_load_statuses.${suffix}`;
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    if (!leaf?.required?.includes("connectivity")) errs.push(`${id} must require connectivity`);
    if (leaf?.route_hint !== "/lists/drivers/driver-load-statuses") errs.push(`${id} route must remain mounted`);
  }

  const mig = get(MIG);
  if (!/DO NOT RUN ON PROD/i.test(mig)) errs.push("migration 202607870000 is missing the 'DO NOT RUN ON PROD' held marker");
  if (!/ADD COLUMN IF NOT EXISTS operating_company_id uuid/.test(mig)) errs.push("migration must ADD operating_company_id to driver_load_statuses");
  if (!/FORCE ROW LEVEL SECURITY/.test(mig)) errs.push("migration must FORCE ROW LEVEL SECURITY");
  if (!/CREATE POLICY company_scope/.test(mig)) errs.push("migration must CREATE POLICY company_scope");
  if (!/UNIQUE \(operating_company_id, code\)/.test(mig)) errs.push("migration must add UNIQUE(operating_company_id, code)");
  if (!/REVOKE DELETE ON catalogs\.driver_load_statuses FROM ih35_app/.test(mig)) errs.push("migration must REVOKE DELETE (void-not-delete)");
  if (!/ON CONFLICT \(operating_company_id, code\) DO NOTHING/.test(mig)) errs.push("migration seed must be idempotent (ON CONFLICT DO NOTHING)");
  // Entities resolved dynamically from org.companies (never hardcoded → fresh-DB FK violation).
  if (!/FROM org\.companies WHERE deactivated_at IS NULL AND id <> v_primary/.test(mig)) errs.push("migration must seed every OTHER active company dynamically from org.companies");
  // The NOT NULL phase column must be carried into the seed copy.
  if (!/SELECT v_seed, code, name, description, phase, sort_order, is_active/.test(mig)) errs.push("migration seed must carry the NOT NULL phase column");

  if (!get(HELD).includes("202607870000_driver_load_statuses_per_entity.sql")) errs.push("202607870000 is not registered in .held-migrations.json");

  // Route scopes by entity: resolver + GUC + operating_company_id in INSERT and WHERE.
  const route = get(ROUTE);
  if (!/resolveOperatingCompanyId/.test(route)) errs.push("route must resolve the caller's company via resolveOperatingCompanyId");
  if (!/set_config\('app\.operating_company_id'/.test(route)) errs.push("route must set the app.operating_company_id GUC (FORCE-RLS scope)");
  if (!/INSERT INTO catalogs\.driver_load_statuses \(\s*operating_company_id,/.test(route)) errs.push("route INSERT must write operating_company_id as the first column");
  if (!/WHERE operating_company_id = \$1/.test(route)) errs.push("route list must filter by operating_company_id");

  // Registry sets the entity GUC so its per-entity catalog counts/previews don't read a false 0.
  const registry = get(REGISTRY);
  if (!/resolveOperatingCompanyId/.test(registry)) errs.push("catalog-registry must resolve the caller's company");
  if (!/set_config\('app\.operating_company_id'/.test(registry)) errs.push("catalog-registry must set the entity GUC before reading per-entity catalogs");

  const api = get(API);
  for (const token of [
    "listDriverLoadStatuses(operatingCompanyId: string",
    "createDriverLoadStatus(operatingCompanyId: string",
    "updateDriverLoadStatus(operatingCompanyId: string",
    'operating_company_id: operatingCompanyId',
  ]) if (!api.includes(token)) errs.push(`frontend API must explicitly scope ${token}`);
  const page = get(PAGE);
  for (const token of [
    "const { selectedCompanyId } = useCompanyContext()",
    "listDriverLoadStatuses(companyId, includeInactive)",
    "createDriverLoadStatus(companyId, payload)",
    "updateDriverLoadStatus(companyId, id, payload)",
    "enabled: Boolean(companyId)",
  ]) if (!page.includes(token)) errs.push(`Lists page must bind selected company: ${token}`);

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
    const problems = assertDriverLoadStatusesPerEntity(mutated);
    if (!problems.some((x) => x.includes(needle))) failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  expectCaught("route-resolver-removed", { ...live, [ROUTE]: live[ROUTE].replace(/resolveOperatingCompanyId/g, "someResolver") }, "resolveOperatingCompanyId");
  expectCaught("route-guc-removed", { ...live, [ROUTE]: live[ROUTE].replace(/set_config\('app\.operating_company_id'/g, "set_config('app.other'") }, "app.operating_company_id GUC");
  expectCaught("registry-guc-removed", { ...live, [REGISTRY]: live[REGISTRY].replace(/set_config\('app\.operating_company_id'/g, "set_config('app.other'") }, "catalog-registry must set the entity GUC");
  expectCaught("mig-force-rls-removed", { ...live, [MIG]: live[MIG].replace(/FORCE ROW LEVEL SECURITY/g, "no rls") }, "FORCE ROW LEVEL SECURITY");
  expectCaught("mig-phase-dropped", { ...live, [MIG]: live[MIG].replace("SELECT v_seed, code, name, description, phase, sort_order, is_active", "SELECT v_seed, code, name, description, sort_order, is_active") }, "carry the NOT NULL phase");
  expectCaught("api-company-dropped", { ...live, [API]: live[API].replace("listDriverLoadStatuses(operatingCompanyId: string", "listDriverLoadStatuses(") }, "frontend API must explicitly scope");
  expectCaught("page-company-dropped", { ...live, [PAGE]: live[PAGE].replace("listDriverLoadStatuses(companyId, includeInactive)", "listDriverLoadStatuses(includeInactive)") }, "Lists page must bind selected company");
  expectCaught("matrix-leaf-dropped", { ...live, [MATRIX]: live[MATRIX].replace('"id": "catalog.drivers.driver_load_statuses.list"', '"id": "catalog.drivers.driver_load_statuses.list.broken"') }, "must require connectivity");

  const liveProblems = assertDriverLoadStatusesPerEntity(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 8 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertDriverLoadStatusesPerEntity();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — driver_load_statuses selected-company frontend + scoped route/registry/migration + exact Lists cells consistent.`);
