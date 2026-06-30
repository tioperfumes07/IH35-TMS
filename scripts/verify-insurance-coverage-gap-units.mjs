// Guard (GUARD #40 / INS-COVERAGE): the insurance coverage-gap count must be computed over
// mdata.units (the authoritative fleet), NOT over mdata.assets (a partial ~43-row mirror). The old
// query counted FROM mdata.assets, so units with no asset row were invisible (dashboard showed 43).
//
// INSURANCE-1 moved the canonical query into apps/backend/src/insurance/coverage-gap-units.shared.ts
// (`COVERAGE_GAP_UNITS_SQL`), consumed by BOTH the summary KPI and the Coverage Gaps detail tab so
// the headline number is traceable to the list. This guard validates the query in its new home and
// pins that the summary still derives from it — so it can't regress to an assets-only count.
import { readFileSync } from "node:fs";

const fail = (m) => { console.error(`FAIL verify-insurance-coverage-gap-units: ${m}`); process.exit(1); };

// 1) The canonical shared query counts FROM mdata.units (the fleet) as its base.
const sharedFile = "apps/backend/src/insurance/coverage-gap-units.shared.ts";
const shared = readFileSync(sharedFile, "utf8");
const m = shared.match(/COVERAGE_GAP_UNITS_SQL\s*=\s*`([\s\S]*?)`/);
if (!m) fail("could not find COVERAGE_GAP_UNITS_SQL in coverage-gap-units.shared.ts");
const sql = m[1];

// The FIRST (base) FROM must be mdata.units — mdata.assets may appear only inside the nested LATERAL
// coverage lookup, never as the count base (that was the 43-vs-87 bug).
const firstFrom = sql.match(/\bFROM\s+([a-z_]+\.[a-z_]+)/i)?.[1] ?? "";
if (firstFrom.toLowerCase() !== "mdata.units")
  fail(`coverage-gap query base must be mdata.units, found FROM ${firstFrom || "(none)"} (the 43-vs-87 bug)`);
if (!/insurance\.policy_unit/.test(sql) || !/status\s*=\s*'active'/.test(sql))
  fail("coverage-gap query must still exclude units that DO have an active policy (insurance.policy_unit + status='active')");

// 2) The summary KPI must derive coverage_gap_count from the shared canonical query + classifier,
//    so it cannot drift back to an independent assets-only count.
const summary = readFileSync("apps/backend/src/insurance/summary.routes.ts", "utf8");
if (!/COVERAGE_GAP_UNITS_SQL/.test(summary) || !/classifyCoverageGapUnits/.test(summary))
  fail("summary.routes.ts must derive coverage_gap_count from COVERAGE_GAP_UNITS_SQL + classifyCoverageGapUnits");

console.log("OK verify-insurance-coverage-gap-units: coverage gap counts active units lacking coverage (shared canonical units query).");
