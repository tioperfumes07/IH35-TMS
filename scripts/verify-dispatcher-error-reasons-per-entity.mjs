#!/usr/bin/env node
/**
 * GUARD (LST-CAT-06): dispatcher_error_reasons per-entity migration + load-derived GUC.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatcher-error-reasons-per-entity";
const MIG = "db/migrations/202608010000_dispatcher_error_reasons_per_entity.sql";
const HELD = "db/migrations/.held-migrations.json";
const ROUTE = "apps/backend/src/mdata/dispatcher-safety-events.routes.ts";
const FILES = [MIG, HELD, ROUTE];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertDispatcherErrorReasonsPerEntity(sources) {
  const get = (rel) => sources?.[rel] ?? read(rel);
  const errs = [];
  const mig = get(MIG);
  if (!/DO NOT RUN ON PROD/i.test(mig)) errs.push("migration missing DO NOT RUN ON PROD held marker");
  if (!/ADD COLUMN IF NOT EXISTS operating_company_id uuid/.test(mig)) errs.push("migration must ADD operating_company_id");
  if (!/FORCE ROW LEVEL SECURITY/.test(mig)) errs.push("migration must FORCE ROW LEVEL SECURITY");
  if (!/CREATE POLICY company_scope/.test(mig)) errs.push("migration must CREATE POLICY company_scope");
  if (!/UNIQUE \(operating_company_id, code\)/.test(mig)) errs.push("migration must UNIQUE(operating_company_id, code)");
  if (!/REVOKE DELETE ON catalogs\.dispatcher_error_reasons FROM ih35_app/.test(mig)) {
    errs.push("migration must REVOKE DELETE");
  }
  if (!/DROP POLICY IF EXISTS der_select_owner_admin/.test(mig)) {
    errs.push("migration must DROP role-only der_select_owner_admin");
  }
  if (!/code = 'TRANSP'/.test(mig)) errs.push("migration must resolve TRANSP by code (no hardcoded UUID sole owner)");
  if (!/FROM org\.companies WHERE deactivated_at IS NULL AND id <> v_primary/.test(mig)) {
    errs.push("migration must seed every OTHER active company");
  }
  if (!get(HELD).includes("202608010000_dispatcher_error_reasons_per_entity.sql")) {
    errs.push("202608010000 not registered in .held-migrations.json");
  }

  const route = get(ROUTE);
  if (!/resolveOperatingCompanyId/.test(route)) errs.push("route must use resolveOperatingCompanyId");
  if (!/set_config\('app\.operating_company_id'/.test(route)) errs.push("route must set app.operating_company_id GUC");
  if (!/scopeToRelatedEntity/.test(route)) errs.push("create path must use scopeToRelatedEntity (load-first)");
  if (!/SELECT operating_company_id FROM mdata\.loads WHERE id = \$1/.test(route)) {
    errs.push("scopeToRelatedEntity must read mdata.loads.operating_company_id");
  }
  if (/ORDER BY\s+id\s+LIMIT\s+1/i.test(route)) errs.push("route must not use ORDER BY id LIMIT 1 entity hijack");
  return errs;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const live = Object.fromEntries(FILES.map((r) => [r, read(r)]));
  const broken = {
    ...live,
    [ROUTE]: live[ROUTE].replace(/scopeToRelatedEntity/g, "scopeToCallerOnly"),
  };
  if (!assertDispatcherErrorReasonsPerEntity(broken).some((e) => e.includes("scopeToRelatedEntity"))) {
    console.error(`${LABEL} --selftest FAIL: load-first scope not flagged`);
    process.exit(1);
  }
  const good = assertDispatcherErrorReasonsPerEntity(live);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = assertDispatcherErrorReasonsPerEntity();
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — migration + load-derived GUC wired.`);
}
