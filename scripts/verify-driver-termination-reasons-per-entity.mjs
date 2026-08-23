#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.drivers.termination_reasons.list","catalog.drivers.termination_reasons.create"],"task":"LISTS-F5963-TERMINATION-REASON-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
// verify:driver-termination-reasons-per-entity
//
// Locks the per-entity conversion of catalogs.driver_termination_reasons (owner ruling 2026-07-24;
// migration 202607890000). The catalog is managed AND referenced from the same file, and the reason
// must resolve in the DRIVER's entity — so this asserts both the catalog CRUD scoping and the
// referencing safety-event handlers' driver-company GUC, plus the cross-entity returning-detection.
//
// FAILS on the pre-fix tree and PASSES only when all of it is present. `--selftest` plants each defect
// in an in-memory copy of the REAL sources and asserts every one is caught, then asserts live clean.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:driver-termination-reasons-per-entity";
const SELFTEST = process.argv.includes("--selftest");

const MIG = "db/migrations/202607890000_driver_termination_reasons_per_entity.sql";
const HELD = "db/migrations/.held-migrations.json";
const ROUTE = "apps/backend/src/mdata/driver-safety-events.routes.ts";
const RETURNING = "apps/backend/src/mdata/driver-returning-detection.routes.ts";
const API = "apps/frontend/src/api/catalogs.ts";
const PAGE = "apps/frontend/src/pages/lists/drivers/TerminationReasonsListPage.tsx";
const MATRIX = "docs/specs/scoreboard/modules/lists.required.json";
const FILES = [MIG, HELD, ROUTE, RETURNING, API, PAGE, MATRIX];

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertDriverTerminationReasonsPerEntity(sources) {
  const get = (rel) => sources?.[rel] ?? readDisk(rel);
  const errs = [];

  let matrix;
  try { matrix = JSON.parse(get(MATRIX)); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  for (const suffix of ["list", "create"]) {
    const id = `catalog.drivers.termination_reasons.${suffix}`;
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    if (!leaf?.required?.includes("connectivity")) errs.push(`${id} must require connectivity`);
    if (leaf?.route_hint !== "/lists/drivers/termination-reasons") errs.push(`${id} route must remain mounted`);
  }

  const mig = get(MIG);
  if (!/DO NOT RUN ON PROD/i.test(mig)) errs.push("migration 202607890000 missing the 'DO NOT RUN ON PROD' held marker");
  if (!/ADD COLUMN IF NOT EXISTS operating_company_id uuid/.test(mig)) errs.push("migration must ADD operating_company_id");
  if (!/FORCE ROW LEVEL SECURITY/.test(mig)) errs.push("migration must FORCE ROW LEVEL SECURITY");
  if (!/CREATE POLICY company_scope/.test(mig)) errs.push("migration must CREATE POLICY company_scope");
  if (!/UNIQUE \(operating_company_id, code\)/.test(mig)) errs.push("migration must add UNIQUE(operating_company_id, code)");
  if (!/REVOKE DELETE ON catalogs\.driver_termination_reasons FROM ih35_app/.test(mig)) errs.push("migration must REVOKE DELETE (void-not-delete)");
  if (!/ON CONFLICT \(operating_company_id, code\) DO NOTHING/.test(mig)) errs.push("migration seed must be idempotent (ON CONFLICT DO NOTHING)");
  if (!/FROM org\.companies WHERE deactivated_at IS NULL AND id <> v_primary/.test(mig)) errs.push("migration must seed every OTHER active company dynamically from org.companies");

  if (!get(HELD).includes("202607890000_driver_termination_reasons_per_entity.sql")) errs.push("202607890000 is not registered in .held-migrations.json");

  const route = get(ROUTE);
  if (!/resolveOperatingCompanyId/.test(route)) errs.push("route must resolve the caller's company (catalog CRUD)");
  if (!/set_config\('app\.operating_company_id'/.test(route)) errs.push("route must set the app.operating_company_id GUC");
  // The referencing handlers must scope by the DRIVER's company, not the caller's.
  if (!/scopeToDriverCompany/.test(route)) errs.push("referencing safety-event handlers must set the GUC from the DRIVER's company (scopeToDriverCompany)");
  if (!/SELECT operating_company_id FROM mdata\.drivers WHERE id = \$1/.test(route)) errs.push("scopeToDriverCompany must read mdata.drivers.operating_company_id");
  if (!/INSERT INTO catalogs\.driver_termination_reasons \(operating_company_id,/.test(route)) errs.push("catalog INSERT must write operating_company_id");
  if (!/FROM catalogs\.driver_termination_reasons\s+WHERE operating_company_id = \$1::uuid/.test(route)) {
    errs.push("catalog GET must predicate selected operating_company_id (Owner RLS is not a backstop)");
  }
  if (!/app\.get\("\/api\/v1\/catalogs\/driver-termination-reasons", \{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \} \} \}/.test(route)) {
    errs.push("catalog GET must retain its auth-route rate limit");
  }
  if (!/app\.get\("\/api\/v1\/catalogs\/driver-termination-reasons"[\s\S]{0,900}operating_company_id: z\.string\(\)\.uuid\(\),/.test(route)) {
    errs.push("catalog GET must require selected operating_company_id");
  }
  if (!/\[opco\]/.test(route)) errs.push("catalog GET must bind the resolved selected company");

  const returning = get(RETURNING);
  if (!/resolveOperatingCompanyId/.test(returning) || !/set_config\('app\.operating_company_id'/.test(returning))
    errs.push("returning-driver detection must set the entity GUC (its termination-reason JOIN is per-entity + FORCE RLS)");

  const api = get(API);
  for (const token of [
    "listDriverTerminationReasons(operatingCompanyId: string",
    "createDriverTerminationReason(operatingCompanyId: string",
    "updateDriverTerminationReason(operatingCompanyId: string",
    "deactivateDriverTerminationReason(operatingCompanyId: string",
    "reactivateDriverTerminationReason(operatingCompanyId: string",
    "operating_company_id: operatingCompanyId",
  ]) if (!api.includes(token)) errs.push(`frontend API must explicitly scope ${token}`);
  const page = get(PAGE);
  for (const token of [
    "const { selectedCompanyId } = useCompanyContext()",
    "listDriverTerminationReasons(companyId, true)",
    "createDriverTerminationReason(companyId, payload)",
    "updateDriverTerminationReason(companyId, id, payload)",
    "deactivateDriverTerminationReason(companyId, id)",
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
    const problems = assertDriverTerminationReasonsPerEntity(mutated);
    if (!problems.some((x) => x.includes(needle))) failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  expectCaught("route-driver-scope-removed", { ...live, [ROUTE]: live[ROUTE].replace(/scopeToDriverCompany/g, "scopeToNothing") }, "scopeToDriverCompany");
  expectCaught("route-driver-opco-read-removed", { ...live, [ROUTE]: live[ROUTE].replace(/SELECT operating_company_id FROM mdata\.drivers WHERE id = \$1/g, "SELECT 1 WHERE true") }, "mdata.drivers.operating_company_id");
  expectCaught("route-insert-unscoped", { ...live, [ROUTE]: live[ROUTE].replace(/INSERT INTO catalogs\.driver_termination_reasons \(operating_company_id, /g, "INSERT INTO catalogs.driver_termination_reasons (") }, "catalog INSERT must write operating_company_id");
  expectCaught("route-get-unscoped", { ...live, [ROUTE]: live[ROUTE].replace(/WHERE operating_company_id = \$1::uuid/g, "WHERE true") }, "catalog GET must predicate selected operating_company_id");
  expectCaught("route-get-rate-limit-removed", { ...live, [ROUTE]: live[ROUTE].replace('app.get("/api/v1/catalogs/driver-termination-reasons", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', 'app.get("/api/v1/catalogs/driver-termination-reasons",') }, "catalog GET must retain its auth-route rate limit");
  expectCaught("route-get-company-optional", {
    ...live,
    [ROUTE]: live[ROUTE].replace(
      '      operating_company_id: z.string().uuid(),\n    });\n    const parsedQuery = querySchema',
      '      operating_company_id: z.string().uuid().optional(),\n    });\n    const parsedQuery = querySchema'
    ),
  }, "catalog GET must require selected operating_company_id");
  expectCaught("returning-guc-removed", { ...live, [RETURNING]: live[RETURNING].replace(/set_config\('app\.operating_company_id'/g, "set_config('app.other'") }, "returning-driver detection must set the entity GUC");
  expectCaught("mig-force-rls-removed", { ...live, [MIG]: live[MIG].replace(/FORCE ROW LEVEL SECURITY/g, "no rls") }, "FORCE ROW LEVEL SECURITY");
  expectCaught("api-company-dropped", { ...live, [API]: live[API].replace("listDriverTerminationReasons(operatingCompanyId: string", "listDriverTerminationReasons(") }, "frontend API must explicitly scope");
  expectCaught("page-company-dropped", { ...live, [PAGE]: live[PAGE].replace("listDriverTerminationReasons(companyId, true)", "listDriverTerminationReasons(true)") }, "Lists page must bind selected company");
  expectCaught("matrix-leaf-dropped", { ...live, [MATRIX]: live[MATRIX].replace('"id": "catalog.drivers.termination_reasons.list"', '"id": "catalog.drivers.termination_reasons.list.broken"') }, "must require connectivity");

  const liveProblems = assertDriverTerminationReasonsPerEntity(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 11 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertDriverTerminationReasonsPerEntity();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — driver_termination_reasons selected-company Lists CRUD + driver-scoped references + exact cells consistent.`);
