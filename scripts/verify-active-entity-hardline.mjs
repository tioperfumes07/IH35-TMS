#!/usr/bin/env node
// RULE 49 guard (owner ruling 2026-09-05, ORCH-measured on Neon USMCA).
//
// The driver list showed ~90 "active" drivers keyed off the stale status='Active' flag (103 rows) when
// the real movement-based active fleet is 15-20 (measured: 20 @ 15-day window). This guard is the
// non-regression lock: it fails if the drivers LIST route drops either of the two mandatory exclusion
// filters that keep sample/deactivated rows out of the default list, and it pins that the canonical
// definition lives in the always-apply rule doc.
//
// The movement-based default-list implementation (telematics 15-day window join) carries its OWN
// verify-step guard; this file locks the two invariants that already exist so they cannot silently
// regress while that build lands.
//
// Usage: node scripts/verify-active-entity-hardline.mjs [--selftest]
import { readFileSync, existsSync } from "node:fs";

const DRIVERS_ROUTE = "apps/backend/src/mdata/drivers.routes.ts";
const RULE_DOC = ".cursor/rules/49-active-entity-hardline.mdc";
const ACTIVE_SET_SERVICE = "apps/backend/src/integrations/samsara/active-driver-set/recompute.service.ts";
const ACTIVE_SET_QUERY = "apps/backend/src/integrations/samsara/active-driver-set/query.service.ts";
const ACTIVE_SET_ROUTES = "apps/backend/src/integrations/samsara/active-driver-set/routes.ts";
const UNITS_ROUTE = "apps/backend/src/mdata/units.routes.ts";

function audit(driversSrc, ruleExists, activeSetSrc, querySrc, routesSrc, unitsSrc) {
  const f = [];
  if (!ruleExists) f.push(`${RULE_DOC}: RULE 49 hardline doc must exist (canonical active definition)`);

  // The drivers LIST route must keep both exclusion filters so sample/deactivated rows never enter the
  // default list. Anchored to the exact list-handler filters.push(...) calls (drivers.routes.ts:1352,1366).
  if (!driversSrc.includes(`filters.push("is_sample_data IS NOT TRUE")`))
    f.push(`${DRIVERS_ROUTE}: drivers list must keep filters.push("is_sample_data IS NOT TRUE") (sample drivers never active)`);
  if (!driversSrc.includes(`filters.push("deactivated_at IS NULL")`))
    f.push(`${DRIVERS_ROUTE}: drivers list must keep filters.push("deactivated_at IS NULL") (deactivated drivers never active)`);

  if (!/DEFAULT_THRESHOLD_DAYS\s*=\s*15/.test(activeSetSrc))
    f.push(`${ACTIVE_SET_SERVICE}: canonical movement window must default to 15 days`);
  if (!/FROM telematics\.vehicle_driver_assignments a[\s\S]*JOIN telematics\.vehicle_latest_position p/.test(activeSetSrc))
    f.push(`${ACTIVE_SET_SERVICE}: active set must be rebuilt from assignments joined to live positions`);
  if (!/JOIN mdata\.units u[\s\S]*u\.currently_leased_to_company_id = \$1::uuid/.test(activeSetSrc))
    f.push(`${ACTIVE_SET_SERVICE}: active set must scope units by current lease to the selected carrier`);
  if (!/p\.captured_at >= now\(\) - \(\$2::int \* interval '1 day'\)/.test(activeSetSrc))
    f.push(`${ACTIVE_SET_SERVICE}: active set must use vehicle_latest_position.captured_at freshness`);
  if (!/a\.started_at <= now\(\)[\s\S]*a\.ended_at IS NULL OR a\.ended_at >= now\(\) - \(\$2::int \* interval '1 day'\)/.test(activeSetSrc))
    f.push(`${ACTIVE_SET_SERVICE}: assignment must overlap the canonical movement window`);
  if (/d\.last_seen_at|samsara_webhook_events/.test(activeSetSrc))
    f.push(`${ACTIVE_SET_SERVICE}: dead samsara_drivers.last_seen_at/webhook activity may not define active`);
  if (!/threshold_days:\s*number\s*=\s*DEFAULT_THRESHOLD_DAYS/.test(querySrc))
    f.push(`${ACTIVE_SET_QUERY}: query fallback must share DEFAULT_THRESHOLD_DAYS`);
  if (!/enum\(\["7", "14", "15", "30"\]\)/.test(routesSrc) || !/Number\(v \?\? "15"\)/.test(routesSrc))
    f.push(`${ACTIVE_SET_ROUTES}: API must expose and default the owner-selected 15-day window`);

  if (!/status === "Active"[\s\S]*integrations\.active_driver_set_cache canonical_active_cache/.test(driversSrc))
    f.push(`${DRIVERS_ROUTE}: status=Active list requests must use the canonical movement-derived cache`);
  if (!/canonical_active_cache\.operating_company_id = \$\$\{ociIdx\}::uuid[\s\S]*canonical_active_cache\.threshold_days = 15/.test(driversSrc))
    f.push(`${DRIVERS_ROUTE}: active driver list cache read must be company-scoped at the 15-day window`);
  if (!/status === "InService"[\s\S]*currently_leased_to_company_id = \$\$\{ociIdx\}::uuid[\s\S]*is_oos IS NOT TRUE/.test(unitsSrc))
    f.push(`${UNITS_ROUTE}: status=InService list requests must use canonical lease scope and exclude OOS units`);

  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const driversSrc = readFileSync(DRIVERS_ROUTE, "utf8");
  const ruleExists = existsSync(RULE_DOC);

  const activeSetSrc = readFileSync(ACTIVE_SET_SERVICE, "utf8");
  const querySrc = readFileSync(ACTIVE_SET_QUERY, "utf8");
  const routesSrc = readFileSync(ACTIVE_SET_ROUTES, "utf8");
  const unitsSrc = readFileSync(UNITS_ROUTE, "utf8");
  const failures = audit(driversSrc, ruleExists, activeSetSrc, querySrc, routesSrc, unitsSrc);
  if (failures.length) {
    console.error("FAIL verify-active-entity-hardline:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }

  if (selftest) {
    const m1 = driversSrc.replaceAll(`filters.push("is_sample_data IS NOT TRUE")`, `filters.push("1=1")`);
    if (audit(m1, ruleExists, activeSetSrc, querySrc, routesSrc, unitsSrc).length === 0) { console.error("SELFTEST FAIL: dropping is_sample_data filter did not trip"); process.exit(1); }
    const m2 = driversSrc.replaceAll(`filters.push("deactivated_at IS NULL")`, `filters.push("1=1")`);
    if (audit(m2, ruleExists, activeSetSrc, querySrc, routesSrc, unitsSrc).length === 0) { console.error("SELFTEST FAIL: dropping deactivated filter did not trip"); process.exit(1); }
    if (audit(driversSrc, false, activeSetSrc, querySrc, routesSrc, unitsSrc).length === 0) { console.error("SELFTEST FAIL: missing rule doc did not trip"); process.exit(1); }
    const mutations = [
      activeSetSrc.replace("DEFAULT_THRESHOLD_DAYS = 15", "DEFAULT_THRESHOLD_DAYS = 7"),
      activeSetSrc.replace("JOIN telematics.vehicle_latest_position p", "JOIN integrations.samsara_drivers p"),
      activeSetSrc.replace("u.currently_leased_to_company_id = $1::uuid", "u.owner_company_id = $1::uuid"),
      activeSetSrc.replace("p.captured_at >=", "p.captured_at <"),
    ];
    for (const mutation of mutations) {
      if (audit(driversSrc, ruleExists, mutation, querySrc, routesSrc, unitsSrc).length === 0) {
        console.error("SELFTEST FAIL: planted active-set mutation escaped");
        process.exit(1);
      }
    }
    const listMutations = [
      driversSrc.replace("integrations.active_driver_set_cache canonical_active_cache", "integrations.samsara_drivers canonical_active_cache"),
      unitsSrc.replace("is_oos IS NOT TRUE", "is_oos IS TRUE"),
    ];
    if (audit(listMutations[0], ruleExists, activeSetSrc, querySrc, routesSrc, unitsSrc).length === 0) {
      console.error("SELFTEST FAIL: planted active-driver list mutation escaped"); process.exit(1);
    }
    if (audit(driversSrc, ruleExists, activeSetSrc, querySrc, routesSrc, listMutations[1]).length === 0) {
      console.error("SELFTEST FAIL: planted active-unit list mutation escaped"); process.exit(1);
    }
    console.log("SELFTEST OK: guard trips on driver exclusions + 4 active-set mutations");
  }

  console.log("PASS verify-active-entity-hardline");
}

main();
