#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["connectivity"],"leaves":["integrity_reports.list"],"task":"SAFETY-F6877-INTEGRITY-REPORTS-SILENT-CAPS","vertical":"class-sweep"} */
import fs from "node:fs";

const files = {
  route: fs.readFileSync("apps/backend/src/routes/safety/integrity.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safetyV64.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx", "utf8"),
  test: fs.readFileSync("apps/backend/src/routes/safety/__tests__/integrity.routes.test.ts", "utf8"),
};

const checks = [
  ["route", /const rangeQuerySchema = companyQuerySchema\.extend\([\s\S]*max\(200\).*default\(50\)[\s\S]*offset:/, "bounded shared range"],
  ["route", /count\(\*\)::int AS total_count FROM safety\.v_wo_cost_outliers/, "WO exact total"],
  ["route", /count\(\*\)::int AS total_count FROM safety\.v_fuel_mpg_anomalies/, "fuel exact total"],
  ["route", /count\(\*\)::int AS total_count FROM safety\.v_driver_dwell_outliers/, "dwell exact total"],
  ["route", /count\(\*\)::int AS total_count FROM safety\.v_hos_pattern_breaks/, "HOS exact total"],
  ["route", /ORDER BY o\.created_at DESC LIMIT \$2 OFFSET \$3/, "WO bounded page"],
  ["route", /ORDER BY o\.transaction_date DESC LIMIT \$2 OFFSET \$3/, "fuel bounded page"],
  ["route", /ORDER BY o\.minutes_over_avg DESC LIMIT \$2 OFFSET \$3/, "dwell bounded page"],
  ["route", /ORDER BY o\.violations_30d DESC LIMIT \$2 OFFSET \$3/, "HOS bounded page"],
  ["route", /ids\.length > 200[\s\S]*z\.string\(\)\.uuid\(\)\.safeParse/, "bounded canonical observation IDs"],
  ["route", /AND id = ANY\(\$2::uuid\[\]\)/, "current-page observation lookup"],
  ["api", /function integrityRangeQuery\([\s\S]*limit: String\(range\.limit\)[\s\S]*offset: String\(range\.offset\)/, "typed API range"],
  ["api", /ids: ids\.join\(","\)/, "typed observation ID request"],
  ["page", /enabled: Boolean\(companyId\) && subTab === "wo-cost"/, "active-tab query ownership"],
  ["page", /queryKey: \["safety-v64", "integrity", "observations", companyId, currentRowIds\.join\(","\)\]/, "page-scoped review status"],
  ["page", /data-testid="integrity-reports-server-pager"/, "mounted exact pager"],
  ["page", /setPage\(1\);\s*\}, \[subTab\]\)/, "subtab page reset"],
  ["page", /pageSize=\{REPORT_PAGE_SIZE\}[\s\S]*hidePager/, "single pager owner"],
  ["test", /it\.each\(\[[\s\S]*wo-cost-outliers[\s\S]*hos-pattern-breaks/, "four-route range test"],
  ["test", /id = ANY\(\$2::uuid\[\]\)[\s\S]*OBSERVATION/, "observation ID test"],
];

function failures(source) {
  return checks.filter(([key, re]) => !re.test(source[key])).map(([, , label]) => label);
}

const failed = failures(files);
if (failed.length) {
  console.error(`FAIL verify-safety-integrity-reports-range-vertical: ${failed.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [key, re, label] of checks) {
    const mutant = { ...files, [key]: files[key].replace(re, "PLANTED_DEFECT") };
    if (!failures(mutant).includes(label)) {
      console.error(`FAIL selftest: mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-safety-integrity-reports-range-vertical --selftest (${checks.length}/${checks.length} mutations killed)`);
} else {
  console.log(`PASS verify-safety-integrity-reports-range-vertical (${checks.length}/${checks.length} checks)`);
}
