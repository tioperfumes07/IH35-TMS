#!/usr/bin/env node
/**
 * verify-mdata-list-pagination
 *
 * GO-LIVE DATA-TRUTH guard. The mdata list endpoints (drivers, units, customers, vendors) default to
 * LIMIT 50 and previously returned ONLY a row array with NO total count. The UI then paginated within
 * the 50 already-fetched rows ("1-15 of 50") while row #51+ was NEVER fetched -> invisible, unreachable
 * (drivers 86 real / units 93 real, truncated to 50 on prod 2026-06-16). DATA TRUNCATION AT SOURCE.
 *
 * Every mdata list endpoint must return a real total so the UI can page through the FULL set.
 * This guard fails if any of them stops returning `total` from a `count(*)` over the same filters.
 */
import { readFileSync } from "node:fs";

const REQUIRED = [
  "apps/backend/src/mdata/drivers.routes.ts",
  "apps/backend/src/mdata/units.routes.ts",
  "apps/backend/src/mdata/customers.routes.ts",
  "apps/backend/src/mdata/vendors.routes.ts",
];

const failures = [];
for (const file of REQUIRED) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    failures.push(`${file}: file missing`);
    continue;
  }
  const hasCount = /count\(\*\)::int AS total/.test(src);
  const returnsTotal = /total:\s*result\.total/.test(src);
  if (!hasCount) failures.push(`${file}: no \`count(*)::int AS total\` (list endpoint must return a real total)`);
  if (!returnsTotal) failures.push(`${file}: list response does not return \`total: result.total\``);
}

if (failures.length > 0) {
  console.error("\n✗ verify-mdata-list-pagination: mdata list endpoint(s) missing total-count pagination.");
  console.error("  A list endpoint that caps rows without returning a total silently truncates data at the source.");
  console.error("  Add a count(*) over the same filters and return { <rows>, total }.\n");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ verify-mdata-list-pagination: all ${REQUIRED.length} mdata list endpoints return a real total.`);
