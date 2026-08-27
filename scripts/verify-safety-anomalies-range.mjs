#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  route: "apps/backend/src/integrity/anomaly-status.routes.ts",
  api: "apps/frontend/src/api/safety.ts",
  tab: "apps/frontend/src/pages/safety/tabs/AnomaliesTab.tsx",
  reverse: "apps/frontend/src/components/safety/SafetyAlertsReverseSection.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), "utf8")]));

const checks = [
  ["route validates bounded limit", () => /limit:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)/.test(source.route)],
  ["route validates nonnegative offset", () => /offset:\s*z\.coerce\.number\(\)\.int\(\)\.min\(0\)/.test(source.route)],
  ["route counts exact scoped filter graph", () => /COUNT\(\*\)::text AS total_count FROM integrity\.anomalies a WHERE \$\{filters\.join/.test(source.route)],
  ["route applies parameterized limit and offset", () => /LIMIT \$\$\{values\.length - 1\}::int OFFSET \$\$\{values\.length\}::int/.test(source.route)],
  ["route publishes total count", () => /total_count:\s*Number\(countResult\.rows\[0\]\?\.total_count \?\? 0\)/.test(source.route)],
  ["client carries range and total contract", () => /limit\?: number; offset\?: number/.test(source.api) && /apiRequest<\{ anomalies: SafetyAnomaly\[\]; total_count: number \}>\(`\/api\/v1\/integrity\/anomalies/.test(source.api)],
  ["mounted tab requests the server page", () => /offset:\s*\(page - 1\) \* pageSize/.test(source.tab)],
  ["mounted tab resets range lifecycle", () => /useEffect\(\(\) => setPage\(1\), \[companyId, severity, status\]\)/.test(source.tab)],
  ["mounted tab has exact external pager", () => /anomalies-server-pager/.test(source.tab) && /\{totalCount\} anomalies/.test(source.tab) && /hidePager/.test(source.tab)],
  ["reverse requests subject page", () => /offset:\s*\(anomalyPage - 1\) \* anomalyPageSize/.test(source.reverse)],
  ["reverse resets on company and parent", () => /setAnomalyPage\(1\)[\s\S]*\[operatingCompanyId, subjectKind, subjectId\]/.test(source.reverse)],
  ["reverse exposes exact pager", () => /safety-anomalies-reverse-pager-\$\{subjectKind\}/.test(source.reverse) && /\{anomalyTotal\} anomalies/.test(source.reverse)],
];

function failures() { return checks.filter(([, check]) => !check()).map(([name]) => name); }
const normal = failures();
if (normal.length) {
  console.error(`FAIL verify-safety-anomalies-range: ${normal.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const originals = structuredClone(source);
  const mutations = [
    ["limit", "route", ".max(100)", ".max(1000)"],
    ["offset", "route", ".min(0).default(0)", ".min(-1).default(0)"],
    ["count", "route", "COUNT(*)::text AS total_count", "0::text AS total_count"],
    ["range", "route", "LIMIT $${values.length - 1}::int OFFSET $${values.length}::int", "LIMIT 100"],
    ["total", "route", "total_count: Number(countResult.rows[0]?.total_count ?? 0)", "total_count: pageResult.rows.length"],
    ["client", "api", "apiRequest<{ anomalies: SafetyAnomaly[]; total_count: number }>(`/api/v1/integrity/anomalies", "apiRequest<{ anomalies: SafetyAnomaly[]; count: number }>(`/api/v1/integrity/anomalies"],
    ["tab request", "tab", "offset: (page - 1) * pageSize", "offset: 0"],
    ["tab reset", "tab", "useEffect(() => setPage(1), [companyId, severity, status]);", ""],
    ["tab pager", "tab", "anomalies-server-pager", "anomalies-local-list"],
    ["reverse request", "reverse", "offset: (anomalyPage - 1) * anomalyPageSize", "offset: 0"],
    ["reverse reset", "reverse", "setAnomalyPage(1);", ""],
    ["reverse pager", "reverse", "safety-anomalies-reverse-pager-${subjectKind}", "safety-anomalies-summary-${subjectKind}"],
  ];
  for (const [name, key, needle, replacement] of mutations) {
    source[key] = originals[key].replace(needle, replacement);
    if (failures().length === 0) {
      console.error(`FAIL selftest: mutation survived (${name})`);
      process.exit(1);
    }
    source[key] = originals[key];
  }
  console.log(`PASS verify-safety-anomalies-range --selftest (${mutations.length}/${mutations.length} mutations killed)`);
} else {
  console.log(`PASS verify-safety-anomalies-range (${checks.length}/${checks.length} checks)`);
}
