// Guard (GUARD #40 / INS-COVERAGE): the insurance dashboard coverage-gap count must be computed over
// mdata.units (the authoritative ~87-unit fleet), NOT over mdata.assets (a ~43-row partial mirror). The
// old query counted FROM mdata.assets, so units with no asset row were silently invisible (dashboard
// showed 43 = asset count). Lock the fix so it can't regress back to the assets-only count.
import { readFileSync } from "node:fs";

const fail = (m) => { console.error(`FAIL verify-insurance-coverage-gap-units: ${m}`); process.exit(1); };
const file = "apps/backend/src/insurance/summary.routes.ts";
const src = readFileSync(file, "utf8");

// Isolate the coverage_gap_count query block.
const m = src.match(/const coverage_gap_count = await count\(\s*`([\s\S]*?)`\s*\);/);
if (!m) fail("could not find coverage_gap_count query");
const sql = m[1];

if (!/FROM\s+mdata\.units/i.test(sql))
  fail("coverage_gap_count must count FROM mdata.units (the fleet), not mdata.assets");
if (/^\s*SELECT count\(\*\)::int AS count\s+FROM mdata\.assets/i.test(sql.trim()))
  fail("coverage_gap_count must NOT use mdata.assets as the count base (the 43-vs-87 bug)");
if (!/insurance\.policy_unit/.test(sql) || !/status = 'active'/.test(sql))
  fail("coverage_gap_count must still exclude units that DO have an active policy_unit");

console.log("OK verify-insurance-coverage-gap-units: coverage gap counts active units lacking coverage.");
