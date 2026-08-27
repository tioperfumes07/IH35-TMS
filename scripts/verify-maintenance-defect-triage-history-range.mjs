#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["driver","unit","qbo_chrome","connectivity","reverse_link"],"leaves":["defects.convert_to_wo"],"task":"MAINT-F6875-DVIR-DEFECT-TRIAGE-HISTORY-SILENT-50-CAP","vertical":"class-sweep"} */
import fs from "node:fs";
const files = {
  route: fs.readFileSync("apps/backend/src/maintenance/defects.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/maintenance/DefectDetailPage.tsx", "utf8"),
};
const checks = [
  ["route", /history_limit: z\.coerce\.number\(\).*max\(200\)\.default\(50\)/, "bounded history range"],
  ["route", /SELECT count\(\*\)::int AS total_count[\s\S]*payload->>'resource_id' = \$1[\s\S]*event_class LIKE \$2/, "exact audit total"],
  ["route", /LIMIT \$3::int OFFSET \$4::int/, "parameterized history page"],
  ["route", /triage_history_total: Number\(historyCountRes\.rows\[0\]\?\.total_count \?\? 0\)/, "total response"],
  ["api", /historyRange: \{ limit\?: number; offset\?: number \} = \{\}/, "typed history range"],
  ["api", /triage_history_total: number;/, "typed exact total"],
  ["page", /queryKey: \["maintenance", "dvir-defect", operatingCompanyId, defectId, historyPage\]/, "page-keyed detail query"],
  ["page", /limit: historyPageSize, offset: historyPage \* historyPageSize/, "range request"],
  ["page", /data-testid="maint-dvir-defect-history-server-pager"/, "mounted history pager"],
  ["page", /setHistoryPage\(0\)/, "parent/company reset"],
];
function failures(source) { return checks.filter(([key, re]) => !re.test(source[key])).map(([, , label]) => label); }
const failed = failures(files);
if (failed.length) { console.error(`FAIL verify-maintenance-defect-triage-history-range: ${failed.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  for (const [key, re, label] of checks) {
    const mutant = { ...files, [key]: files[key].replace(re, "PLANTED_DEFECT") };
    if (!failures(mutant).includes(label)) { console.error(`FAIL selftest: mutation survived: ${label}`); process.exit(1); }
  }
  console.log(`PASS verify-maintenance-defect-triage-history-range --selftest (${checks.length}/${checks.length} mutations killed)`);
} else console.log(`PASS verify-maintenance-defect-triage-history-range (${checks.length}/${checks.length} checks)`);
