#!/usr/bin/env node
import fs from "node:fs";
const paths = {
  route: "apps/backend/src/safety/dvir.routes.ts",
  api: "apps/frontend/src/api/safety.ts",
  page: "apps/frontend/src/pages/safety/IdvrPage.tsx",
  asset: "apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx",
};
const s = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, fs.readFileSync(p, "utf8")]));
const checks = [
  ["exact scoped count", () => /COUNT\(\*\)::int AS total_count FROM safety\.dvir_submissions ds WHERE \$\{filters\.join/.test(s.route)],
  ["page total response", () => /total_count: Number\(countRes\.rows\[0\]\?\.total_count \?\? 0\)/.test(s.route) && /submissions: result\.rows, total_count: result\.total_count/.test(s.route)],
  ["client total", () => /submissions: Array<Record<string, unknown>>; total_count: number/.test(s.api)],
  ["mounted range", () => /offset: \(page - 1\) \* pageSize/.test(s.page)],
  ["mounted exact pager", () => /idvr-server-pager/.test(s.page) && /\{totalCount\} submissions/.test(s.page) && /hidePager/.test(s.page)],
  ["mounted reset", () => /setPage\(1\), \[operatingCompanyId, applied\]/.test(s.page)],
  ["asset range", () => /offset: \(dvirPage - 1\) \* dvirPageSize/.test(s.asset)],
  ["asset exact total", () => /count=\{dvirTotal\}/.test(s.asset) && /\{dvirTotal\} DVIRs/.test(s.asset)],
  ["asset lifecycle", () => /setDvirPage\(1\)[\s\S]*\[operatingCompanyId, assetKind, assetId\]/.test(s.asset)],
];
const failures = () => checks.filter(([, fn]) => !fn()).map(([name]) => name);
if (failures().length) { console.error(`FAIL verify-safety-dvir-range-vertical: ${failures().join("; ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const original = structuredClone(s);
  const mutations = [
    ["route", "COUNT(*)::int AS total_count", "0::int AS total_count"],
    ["route", "submissions: result.rows, total_count: result.total_count", "submissions: result.rows"],
    ["api", "submissions: Array<Record<string, unknown>>; total_count: number", "submissions: Array<Record<string, unknown>>"],
    ["page", "offset: (page - 1) * pageSize", "offset: 0"],
    ["page", "idvr-server-pager", "idvr-summary"],
    ["page", "setPage(1), [operatingCompanyId, applied]", "setPage(1), []"],
    ["asset", "offset: (dvirPage - 1) * dvirPageSize", "offset: 0"],
    ["asset", "count={dvirTotal}", "count={dvirs.length}"],
    ["asset", "setDvirPage(1);", ""],
  ];
  for (const [key, needle, replacement] of mutations) {
    s[key] = original[key].replace(needle, replacement);
    if (!failures().length) { console.error(`FAIL selftest: mutation survived (${key}:${needle})`); process.exit(1); }
    s[key] = original[key];
  }
  console.log(`PASS verify-safety-dvir-range-vertical --selftest (${mutations.length}/${mutations.length} mutations killed)`);
} else console.log(`PASS verify-safety-dvir-range-vertical (${checks.length}/${checks.length} checks)`);
