#!/usr/bin/env node
import fs from "node:fs";

const paths = {
  route: "apps/backend/src/safety/safety.routes.ts",
  api: "apps/frontend/src/api/safety.ts",
  page: "apps/frontend/src/pages/safety/AccidentsPage.tsx",
  driver: "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx",
  asset: "apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx",
  load: "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx",
};
const s = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, fs.readFileSync(p, "utf8")]));
const checks = [
  ["validated range", () => /const accidentsQuerySchema = companyQuerySchema\.extend\(\{[\s\S]{0,700}limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)[\s\S]{0,150}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)/.test(s.route)],
  ["server date filters", () => /ar\.accident_at >= \$\$\{values\.length\}::date/.test(s.route) && /INTERVAL '1 day'/.test(s.route)],
  ["exact scoped count", () => /COUNT\(\*\)::int AS total_count[\s\S]*safety\.accident_reports ar[\s\S]*scopeFilters\.join/.test(s.route)],
  ["parameterized page", () => /LIMIT \$\$\{values\.length - 1\}::int OFFSET \$\$\{values\.length\}::int/.test(s.route)],
  ["client page total", () => /params: \{ driver_id\?: string; unit_id\?: string; load_id\?: string; trailer_id\?: string; from\?: string; to\?: string; limit\?: number; offset\?: number \}/.test(s.api) && /accidents: Array<Record<string, unknown>>; total_count: number/.test(s.api)],
  ["mounted server filters", () => /driver_id: applied\.driverId[\s\S]*from: applied\.from[\s\S]*offset: \(page - 1\) \* pageSize/.test(s.page)],
  ["mounted exact pager", () => /accidents-server-pager/.test(s.page) && /\{totalCount\} accidents/.test(s.page) && /hidePager/.test(s.page)],
  ["mounted lifecycle reset", () => /setPage\(1\), \[operatingCompanyId, loadIdFromUrl, applied\]/.test(s.page)],
  ["driver reverse page", () => /driver-safety-reverse-accidents-pager/.test(s.driver) && /offset: \(accidentPage - 1\) \* accidentPageSize/.test(s.driver)],
  ["asset reverse page", () => /asset-safety-reverse-accidents-pager/.test(s.asset) && /offset: \(accidentPage - 1\) \* accidentPageSize/.test(s.asset)],
  ["load reverse page", () => /load-safety-reverse-accidents-pager/.test(s.load) && /offset: \(accidentPage - 1\) \* accidentPageSize/.test(s.load)],
  ["reverse exact totals", () => /count=\{accidentTotal\}/.test(s.driver) && /count=\{accidentTotal\}/.test(s.asset) && /\(\{accidentTotal\}\)/.test(s.load)],
];
const failures = () => checks.filter(([, fn]) => !fn()).map(([name]) => name);
if (failures().length) { console.error(`FAIL verify-safety-accidents-range-vertical: ${failures().join("; ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const original = structuredClone(s);
  const mutations = [
    ["route", "const accidentsQuerySchema = companyQuerySchema.extend({", "const accidentsRangeSchema = companyQuerySchema.extend({"],
    ["route", "ar.accident_at >= $${values.length}::date", "TRUE"],
    ["route", "COUNT(*)::int AS total_count", "0::int AS total_count"],
    ["route", "LIMIT $${values.length - 1}::int OFFSET $${values.length}::int", "LIMIT 500"],
    ["api", "from?: string; to?: string; limit?: number; offset?: number", ""],
    ["page", "offset: (page - 1) * pageSize", "offset: 0"],
    ["page", "accidents-server-pager", "accidents-summary"],
    ["page", "setPage(1), [operatingCompanyId, loadIdFromUrl, applied]", "setPage(1), []"],
    ["driver", "driver-safety-reverse-accidents-pager", "driver-accidents-summary"],
    ["asset", "asset-safety-reverse-accidents-pager", "asset-accidents-summary"],
    ["load", "load-safety-reverse-accidents-pager", "load-accidents-summary"],
    ["driver", "count={accidentTotal}", "count={accidents.length}"],
  ];
  for (const [key, needle, replacement] of mutations) {
    s[key] = original[key].replace(needle, replacement);
    if (!failures().length) { console.error(`FAIL selftest: mutation survived (${key}:${needle})`); process.exit(1); }
    s[key] = original[key];
  }
  console.log(`PASS verify-safety-accidents-range-vertical --selftest (${mutations.length}/${mutations.length} mutations killed)`);
} else console.log(`PASS verify-safety-accidents-range-vertical (${checks.length}/${checks.length} checks)`);
