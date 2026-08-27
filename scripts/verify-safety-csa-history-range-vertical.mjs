#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["connectivity"],"leaves":["csa_score.list","safety_reports.list"],"task":"SAFETY-F6878-CSA-HISTORY-SILENT-50-CAP","vertical":"class-sweep"} */
import fs from "node:fs";

const files = {
  route: fs.readFileSync("apps/backend/src/routes/safety/csa-scores.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safetyV64.ts", "utf8"),
  tab: fs.readFileSync("apps/frontend/src/pages/safety/tabs/CSAScoreTab.tsx", "utf8"),
  reports: fs.readFileSync("apps/frontend/src/pages/safety/reports/SafetyReportsPage.tsx", "utf8"),
  pager: fs.readFileSync("apps/frontend/src/components/safety/CsaHistoryPager.tsx", "utf8"),
  test: fs.readFileSync("apps/backend/src/routes/safety/csa-scores.routes.test.ts", "utf8"),
};

const checks = [
  ["route", /const historyQuerySchema = companyQuerySchema\.extend\([\s\S]*max\(200\).*default\(50\)[\s\S]*offset:/, "bounded history range"],
  ["route", /SELECT count\(\*\)::int AS total_count FROM safety\.csa_scores WHERE operating_company_id = \$1::uuid/, "exact company total"],
  ["route", /ORDER BY period_end DESC LIMIT \$2 OFFSET \$3/, "parameterized history page"],
  ["route", /total_count: Number\(countRes\.rows\[0\]\?\.total_count \?\? 0\)/, "exact total response"],
  ["api", /listCsaScores\(companyId: string, range: \{ limit: number; offset: number \}\)/, "typed range API"],
  ["api", /csa_scores: Array<Record<string, unknown>>; total_count: number/, "typed exact total"],
  ["tab", /queryKey: \["safety-v64", "csa-history", companyId, historyPage\]/, "CSA tab page query"],
  ["tab", /testId="csa-score-history-server-pager"/, "CSA tab mounted pager"],
  ["tab", /setHistoryPage\(1\)/, "CSA tab company reset"],
  ["reports", /queryKey: \["saf-b31", "csa-history", companyId, csaHistoryPage\]/, "reports page query"],
  ["reports", /testId="safety-reports-csa-server-pager"/, "reports mounted pager"],
  ["reports", /setCsaHistoryPage\(1\)/, "reports company reset"],
  ["pager", /totalCount === 0 \? "0 of 0"/, "honest exact range"],
  ["pager", /disabled=\{page >= pageCount \|\| fetching\}/, "bounded next control"],
  ["test", /if \(sql\.includes\("count\(\*\)::int AS total_count"\)\) return \{ rows: \[\{ total_count: 137 \}\] \};/, "exact-range route test"],
];

function failures(source) { return checks.filter(([key, re]) => !re.test(source[key])).map(([, , label]) => label); }
const failed = failures(files);
if (failed.length) { console.error(`FAIL verify-safety-csa-history-range-vertical: ${failed.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  for (const [key, re, label] of checks) {
    const mutant = { ...files, [key]: files[key].replace(re, "PLANTED_DEFECT") };
    if (!failures(mutant).includes(label)) { console.error(`FAIL selftest: mutation survived: ${label}`); process.exit(1); }
  }
  console.log(`PASS verify-safety-csa-history-range-vertical --selftest (${checks.length}/${checks.length} mutations killed)`);
} else console.log(`PASS verify-safety-csa-history-range-vertical (${checks.length}/${checks.length} checks)`);
