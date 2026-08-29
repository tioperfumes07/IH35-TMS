#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["connectivity"],"leaves":["safety.home.active_drivers"]} */
/**
 * HOME-FLEET-UTILIZATION-F4583-SAMPLE-DATA-GAP (continued): the Safety Home "ACTIVE DRIVERS" tile
 * (safety.routes.ts KPI query) excludes archived and pseudo-system drivers but, unlike the canonical
 * driver list/picker read (apps/backend/src/mdata/drivers.routes.ts, is_sample_data IS NOT TRUE,
 * #14909) it never excluded is_sample_data -- even though its own inline comment states the tile
 * "must agree with the canonical Drivers list". Live-measured on prod 2026-08-24 (Neon
 * tiny-field-89581227, USMCA): tile query 80 vs. canonical-list-equivalent 79 -- a real, live
 * one-driver disagreement between two surfaces the query's own comment says must match.
 *
 * Self-test: node scripts/verify-safety-home-active-drivers-excludes-sample-data.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  routes: "apps/backend/src/safety/safety.routes.ts",
};
const LABEL = "verify-safety-home-active-drivers-excludes-sample-data";

export function audit(src) {
  const failures = [];
  // RE-ANCHOR (found stale 2026-08-29): the bare `/FROM mdata\.drivers[\s\S]*?AS active_drivers/`
  // start-anchor also matches an EARLIER, unrelated "FROM mdata.drivers" (a driver-FK-validation
  // subquery, safety.routes.ts:168) — the non-greedy scan then spans all the way from there to the
  // real active_drivers subquery, a ~6.5KB stretch that swallows several unrelated queries AND an
  // explanatory comment (line ~272) that itself contains the literal text
  // "is_sample_data IS NOT TRUE" in prose. That comment alone satisfied the check even after the
  // mutation removed the real code's occurrence -- the selftest correctly caught this as a
  // mutation-escaped guard. Anchored on the unique `(SELECT COUNT(*)::int FROM mdata.drivers`
  // opener instead, which only appears at the real active_drivers subquery.
  const match = src.routes.match(/\(SELECT COUNT\(\*\)::int FROM mdata\.drivers[\s\S]*?AS active_drivers/);
  if (!match) {
    failures.push(`${FILES.routes}: the Safety Home active_drivers KPI subquery not found (re-anchor)`);
    return failures;
  }
  if (!/is_sample_data IS NOT TRUE/.test(match[0])) {
    failures.push(
      `${FILES.routes}: the active_drivers subquery must exclude is_sample_data IS NOT TRUE — a ` +
        `sample-tagged driver would inflate the Safety Home ACTIVE DRIVERS tile above the canonical ` +
        `driver list it is supposed to agree with (HOME-FLEET-UTILIZATION-F4583 class).`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    routes: fs.readFileSync(path.join(root, FILES.routes), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutated = {
    ...good,
    routes: good.routes.replace("\n                AND is_sample_data IS NOT TRUE", ""),
  };
  if (mutated.routes === good.routes) {
    console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(mutated).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 1 mutation detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Safety Home ACTIVE DRIVERS tile excludes is_sample_data fixture drivers`);
