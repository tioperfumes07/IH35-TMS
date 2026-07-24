#!/usr/bin/env node
// verify:customer-quality-reasons-per-entity
//
// Locks the per-entity conversion of catalogs.customer_quality_event_reasons (owner ruling 2026-07-24;
// migration 202607920000). Companion to driver_termination_reasons — the catalog is read + referenced
// from customer-quality-events.routes.ts, and the reason must resolve in the CUSTOMER's entity.
//
// FAILS on the pre-fix tree and PASSES only when all of it is present. `--selftest` plants each defect
// in an in-memory copy of the REAL sources and asserts every one is caught, then asserts live clean.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:customer-quality-reasons-per-entity";
const SELFTEST = process.argv.includes("--selftest");

const MIG = "db/migrations/202607920000_customer_quality_reasons_per_entity.sql";
const HELD = "db/migrations/.held-migrations.json";
const ROUTE = "apps/backend/src/mdata/customer-quality-events.routes.ts";
const FILES = [MIG, HELD, ROUTE];

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertCustomerQualityReasonsPerEntity(sources) {
  const get = (rel) => sources?.[rel] ?? readDisk(rel);
  const errs = [];

  const mig = get(MIG);
  if (!/DO NOT RUN ON PROD/i.test(mig)) errs.push("migration 202607920000 missing the 'DO NOT RUN ON PROD' held marker");
  if (!/ADD COLUMN IF NOT EXISTS operating_company_id uuid/.test(mig)) errs.push("migration must ADD operating_company_id");
  if (!/FORCE ROW LEVEL SECURITY/.test(mig)) errs.push("migration must FORCE ROW LEVEL SECURITY");
  if (!/CREATE POLICY company_scope/.test(mig)) errs.push("migration must CREATE POLICY company_scope");
  if (!/UNIQUE \(operating_company_id, code\)/.test(mig)) errs.push("migration must add UNIQUE(operating_company_id, code)");
  if (!/REVOKE DELETE ON catalogs\.customer_quality_event_reasons FROM ih35_app/.test(mig)) errs.push("migration must REVOKE DELETE (void-not-delete)");
  if (!/ON CONFLICT \(operating_company_id, code\) DO NOTHING/.test(mig)) errs.push("migration seed must be idempotent (ON CONFLICT DO NOTHING)");
  if (!/FROM org\.companies WHERE deactivated_at IS NULL AND id <> v_primary/.test(mig)) errs.push("migration must seed every OTHER active company dynamically from org.companies");
  // NOT NULL event_type/severity + deactivated_at must be carried in the seed copy.
  if (!/SELECT v_seed, code, label, description, event_type, severity, is_active, deactivated_at/.test(mig))
    errs.push("migration seed must carry event_type, severity, and deactivated_at");

  if (!get(HELD).includes("202607920000_customer_quality_reasons_per_entity.sql")) errs.push("202607920000 is not registered in .held-migrations.json");

  const route = get(ROUTE);
  if (!/resolveOperatingCompanyId/.test(route)) errs.push("route must resolve the caller's company");
  // Three scoped paths: GET catalog, GET events JOIN, POST events lookup — each needs the GUC set.
  const gucCount = (route.match(/set_config\('app\.operating_company_id'/g) || []).length;
  if (gucCount < 3) errs.push(`route must set the app.operating_company_id GUC in all 3 handlers (catalog GET + events GET/POST); found ${gucCount}`);
  if (!/r\.operating_company_id = \$1/.test(route)) errs.push("catalog GET must filter by operating_company_id");
  if (!/WHERE id = \$1 AND operating_company_id = \$2/.test(route)) errs.push("POST customer check must be entity-scoped (WHERE id = $1 AND operating_company_id = $2)");

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
    const problems = assertCustomerQualityReasonsPerEntity(mutated);
    if (!problems.some((x) => x.includes(needle))) failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  expectCaught("route-guc-removed", { ...live, [ROUTE]: live[ROUTE].replace(/set_config\('app\.operating_company_id'/g, "set_config('app.other'") }, "GUC in all 3 handlers");
  expectCaught("route-catalog-filter-removed", { ...live, [ROUTE]: live[ROUTE].replace(/r\.operating_company_id = \$1/g, "1 = 1") }, "catalog GET must filter by operating_company_id");
  expectCaught("route-post-check-unscoped", { ...live, [ROUTE]: live[ROUTE].replace(/WHERE id = \$1 AND operating_company_id = \$2/g, "WHERE id = $1") }, "POST customer check must be entity-scoped");
  expectCaught("mig-force-rls-removed", { ...live, [MIG]: live[MIG].replace(/FORCE ROW LEVEL SECURITY/g, "no rls") }, "FORCE ROW LEVEL SECURITY");
  expectCaught("mig-seed-drops-severity", { ...live, [MIG]: live[MIG].replace("SELECT v_seed, code, label, description, event_type, severity, is_active, deactivated_at", "SELECT v_seed, code, label, description, event_type, is_active") }, "carry event_type, severity, and deactivated_at");

  const liveProblems = assertCustomerQualityReasonsPerEntity(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertCustomerQualityReasonsPerEntity();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — customer_quality_event_reasons per-entity (migration + catalog GET + customer-scoped referencing consistent).`);
