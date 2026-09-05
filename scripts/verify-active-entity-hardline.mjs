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

function audit(driversSrc, ruleExists) {
  const f = [];
  if (!ruleExists) f.push(`${RULE_DOC}: RULE 49 hardline doc must exist (canonical active definition)`);

  // The drivers LIST route must keep both exclusion filters so sample/deactivated rows never enter the
  // default list. Anchored to the exact list-handler filters.push(...) calls (drivers.routes.ts:1352,1366).
  if (!driversSrc.includes(`filters.push("is_sample_data IS NOT TRUE")`))
    f.push(`${DRIVERS_ROUTE}: drivers list must keep filters.push("is_sample_data IS NOT TRUE") (sample drivers never active)`);
  if (!driversSrc.includes(`filters.push("deactivated_at IS NULL")`))
    f.push(`${DRIVERS_ROUTE}: drivers list must keep filters.push("deactivated_at IS NULL") (deactivated drivers never active)`);

  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const driversSrc = readFileSync(DRIVERS_ROUTE, "utf8");
  const ruleExists = existsSync(RULE_DOC);

  const failures = audit(driversSrc, ruleExists);
  if (failures.length) {
    console.error("FAIL verify-active-entity-hardline:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }

  if (selftest) {
    const m1 = driversSrc.replaceAll(`filters.push("is_sample_data IS NOT TRUE")`, `filters.push("1=1")`);
    if (audit(m1, ruleExists).length === 0) { console.error("SELFTEST FAIL: dropping is_sample_data filter did not trip"); process.exit(1); }
    const m2 = driversSrc.replaceAll(`filters.push("deactivated_at IS NULL")`, `filters.push("1=1")`);
    if (audit(m2, ruleExists).length === 0) { console.error("SELFTEST FAIL: dropping deactivated filter did not trip"); process.exit(1); }
    if (audit(driversSrc, false).length === 0) { console.error("SELFTEST FAIL: missing rule doc did not trip"); process.exit(1); }
    console.log("SELFTEST OK: guard trips on all mutations");
  }

  console.log("PASS verify-active-entity-hardline");
}

main();
