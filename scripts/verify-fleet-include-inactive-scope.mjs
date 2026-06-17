#!/usr/bin/env node
// Guard (include_inactive): the soft-delete visibility param may ONLY widen the fetch
// (gate the deactivated_at filter). It must NOT touch tenant/RLS or cross-entity scope:
// the operating_company_id tenant filter and the app.operating_company_id RLS set_config
// must remain. Locks the promise Jorge required before merge.
import { readFileSync } from "node:fs";

const SVC = "apps/backend/src/mdata/units-unified-list.service.ts";
const ROUTE = "apps/backend/src/mdata/units.routes.ts";
const failures = [];
const read = (p) => {
  try { return readFileSync(p, "utf8"); } catch { failures.push(`${p}: missing`); return ""; }
};

const svc = read(SVC);
const route = read(ROUTE);

if (svc) {
  // deactivated_at filter must be GATED by include_inactive, not hardcoded.
  if (/const truckFilters: string\[\] = \["deactivated_at IS NULL"/.test(svc) ||
      /const trailerFilters: string\[\] = \["deactivated_at IS NULL"/.test(svc)) {
    failures.push(`${SVC}: deactivated_at filter is still hardcoded (must be gated by include_inactive)`);
  }
  if (!/if \(!options\.include_inactive\) truckFilters\.push\("deactivated_at IS NULL"\)/.test(svc) ||
      !/if \(!options\.include_inactive\) trailerFilters\.push\("deactivated_at IS NULL"\)/.test(svc)) {
    failures.push(`${SVC}: deactivated_at must be pushed only when !options.include_inactive`);
  }
  // Tenant / multi-entity scope MUST remain untouched.
  if (!/tenantFilter\(truckValues, options\.operating_company_id\)/.test(svc) ||
      !/tenantFilter\(trailerValues, options\.operating_company_id\)/.test(svc)) {
    failures.push(`${SVC}: tenant scope filter (tenantFilter) must remain — include_inactive may not touch RLS/cross-entity scope`);
  }
}

if (route) {
  // RLS scoping (set_config of app.operating_company_id) must remain on the list path.
  if (!/set_config\('app\.operating_company_id'/.test(route)) {
    failures.push(`${ROUTE}: app.operating_company_id RLS set_config must remain`);
  }
  if (!/include_inactive/.test(route)) {
    failures.push(`${ROUTE}: include_inactive must be parsed and passed through`);
  }
}

if (failures.length) {
  console.error("verify:fleet-include-inactive-scope — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:fleet-include-inactive-scope — OK (widens fetch only; tenant/RLS scope intact)");
