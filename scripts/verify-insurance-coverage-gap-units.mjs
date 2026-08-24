// Guard (GUARD #40 / INS-COVERAGE): the insurance coverage-gap count must be computed over
// mdata.units (the authoritative fleet), NOT over mdata.assets (a partial ~43-row mirror). The old
// query counted FROM mdata.assets, so units with no asset row were invisible (dashboard showed 43).
//
// INSURANCE-1 moved the canonical query into apps/backend/src/insurance/coverage-gap-units.shared.ts
// (`COVERAGE_GAP_UNITS_SQL`), consumed by BOTH the summary KPI and the Coverage Gaps detail tab so
// the headline number is traceable to the list. This guard validates the query in its new home and
// pins that the summary still derives from it — so it can't regress to an assets-only count.
import { readFileSync } from "node:fs";

export function collectProblems(shared, summary) {
  const problems = [];
  const match = shared.match(/COVERAGE_GAP_UNITS_SQL\s*=\s*`([\s\S]*?)`/);
  if (!match) return ["could not find COVERAGE_GAP_UNITS_SQL in coverage-gap-units.shared.ts"];
  const sql = match[1];
  const firstFrom = sql.match(/\bFROM\s+([a-z_]+\.[a-z_]+)/i)?.[1] ?? "";
  if (firstFrom.toLowerCase() !== "mdata.units") {
    problems.push(`coverage-gap query base must be mdata.units, found FROM ${firstFrom || "(none)"}`);
  }
  if (!/insurance\.policy_unit/.test(sql)) problems.push("coverage-gap query must join insurance.policy_unit");
  if (!/status\s*=\s*'active'/.test(sql)) problems.push("coverage-gap query must require active policy status");
  if (!/COVERAGE_GAP_UNITS_SQL/.test(summary)) problems.push("summary must reuse COVERAGE_GAP_UNITS_SQL");
  if (!/classifyCoverageGapUnits/.test(summary)) problems.push("summary must reuse classifyCoverageGapUnits");
  return problems;
}

if (process.argv.includes("--selftest")) {
  const goodShared = "export const COVERAGE_GAP_UNITS_SQL = `SELECT u.id FROM mdata.units u LEFT JOIN insurance.policy_unit pu ON pu.unit_id = u.id AND pu.status = 'active'`;";
  const goodSummary = "const rows = await query(COVERAGE_GAP_UNITS_SQL); const coverage_gap_count = classifyCoverageGapUnits(rows);";
  if (collectProblems(goodShared, goodSummary).length) throw new Error("good fixture rejected");
  const mutations = [
    [goodShared.replace("COVERAGE_GAP_UNITS_SQL", "REMOVED_SQL"), goodSummary, "could not find"],
    [goodShared.replace("mdata.units", "mdata.assets"), goodSummary, "base must be mdata.units"],
    [goodShared.replace("insurance.policy_unit", "insurance.policies"), goodSummary, "join insurance.policy_unit"],
    [goodShared.replace("pu.status = 'active'", "TRUE"), goodSummary, "require active policy status"],
    [goodShared, goodSummary.replace("COVERAGE_GAP_UNITS_SQL", "independentSql"), "reuse COVERAGE_GAP_UNITS_SQL"],
    [goodShared, goodSummary.replace("classifyCoverageGapUnits", "rows.length"), "reuse classifyCoverageGapUnits"],
  ];
  for (const [shared, summary, expected] of mutations) {
    const problems = collectProblems(shared, summary);
    if (!problems.some((problem) => problem.includes(expected))) {
      throw new Error(`mutation escaped: ${expected} (${JSON.stringify(problems)})`);
    }
  }
  console.log(`OK verify-insurance-coverage-gap-units --selftest ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

const problems = collectProblems(
  readFileSync("apps/backend/src/insurance/coverage-gap-units.shared.ts", "utf8"),
  readFileSync("apps/backend/src/insurance/summary.routes.ts", "utf8"),
);
if (problems.length) {
  console.error(`FAIL verify-insurance-coverage-gap-units: ${problems.join("; ")}`);
  process.exit(1);
}

console.log("OK verify-insurance-coverage-gap-units: coverage gap counts active units lacking coverage (shared canonical units query).");
