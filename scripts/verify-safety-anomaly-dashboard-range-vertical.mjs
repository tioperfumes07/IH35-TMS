#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","unit","customer","connectivity","reverse_link"],"leaves":["anomaly_alerts.list","safety.drawer.anomaly_detail","safety.parity.anomaly_detail"],"task":"SAFETY-F6874-ANOMALY-DASHBOARD-SILENT-200-CAP","vertical":"class-sweep"} */
import fs from "node:fs";
const files = {
  route: fs.readFileSync("apps/backend/src/safety/anomaly/routes.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/safety/anomaly/AnomalyDashboard.tsx", "utf8"),
  badge: fs.readFileSync("apps/frontend/src/components/safety/AnomalyAlertBadge.tsx", "utf8"),
};
const checks = [
  ["route", /limit: z\.coerce\.number\(\).*max\(200\)\.default\(50\)/, "bounded list range"],
  ["route", /SELECT count\(\*\)::int AS total_count FROM safety\.anomaly_alerts WHERE/, "exact filtered total"],
  ["route", /LIMIT \$\$\{vals\.length - 1\}::int OFFSET \$\$\{vals\.length\}::int/, "parameterized server range"],
  ["route", /alerts: rows\.rows, total_count: rows\.total_count/, "total response"],
  ["page", /queryKey: \["anomaly-alerts", operatingCompanyId, severity, page\]/, "page-keyed query"],
  ["page", /status=open&limit=\$\{pageSize\}&offset=\$\{page \* pageSize\}/, "dashboard range request"],
  ["page", /data-testid="anomaly-alerts-server-pager"/, "mounted pager"],
  ["page", /useEffect\(\(\) => setPage\(0\), \[severity\]\)/, "filter scope reset"],
  ["badge", /severity=critical&limit=1&offset=0/, "bounded badge request"],
  ["badge", /return res\.total_count \?\? 0/, "exact badge total"],
];
function failures(source) { return checks.filter(([key, re]) => !re.test(source[key])).map(([, , label]) => label); }
const failed = failures(files);
if (failed.length) { console.error(`FAIL verify-safety-anomaly-dashboard-range-vertical: ${failed.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  for (const [key, re, label] of checks) {
    const mutant = { ...files, [key]: files[key].replace(re, "PLANTED_DEFECT") };
    if (!failures(mutant).includes(label)) { console.error(`FAIL selftest: mutation survived: ${label}`); process.exit(1); }
  }
  console.log(`PASS verify-safety-anomaly-dashboard-range-vertical --selftest (${checks.length}/${checks.length} mutations killed)`);
} else console.log(`PASS verify-safety-anomaly-dashboard-range-vertical (${checks.length}/${checks.length} checks)`);
