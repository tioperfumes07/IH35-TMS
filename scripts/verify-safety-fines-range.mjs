#!/usr/bin/env node
import fs from "node:fs";

const paths = {
  route: "apps/backend/src/safety/fines.routes.ts",
  api: "apps/frontend/src/api/safety.ts",
  page: "apps/frontend/src/pages/safety/FinesPage.tsx",
};
const source = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(input) {
  const out = [];
  const finesApi = input.api.match(/export function getSafetyFines[\s\S]*?export function createSafetyFine/)?.[0] ?? "";
  if (!/limit:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)/.test(input.route)) out.push("bounded limit schema");
  if (!/offset:\s*z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(input.route)) out.push("bounded offset schema");
  if (!/COUNT\(\*\)::int AS total_count[\s\S]{0,180}?FROM safety\.civil_fines cf[\s\S]{0,180}?WHERE \$\{filters\.join\(" AND "\)\}/.test(input.route)) out.push("exact filtered count");
  if (!/LIMIT \$\$\{rowValues\.length - 1\} OFFSET \$\$\{rowValues\.length\}/.test(input.route)) out.push("server limit offset");
  if (!/return \{ fines: result\.rows, total_count: result\.total_count \}/.test(input.route)) out.push("response total");
  if (!/limit\?: number; offset\?: number/.test(finesApi) || !/qs\.set\("limit"/.test(finesApi) || !/total_count: number/.test(finesApi)) out.push("API pagination contract");
  if (!/getSafetyFines\([\s\S]{0,500}?limit: pageSize,[\s\S]{0,80}?offset: page \* pageSize/.test(input.page)) out.push("page query range");
  if (!/hidePager/.test(input.page) || !/data-testid="external-fines-server-pager"/.test(input.page)) out.push("single exact-total pager");
  return out;
}

const current = failures(source);
if (current.length) {
  console.error(`FAIL: ${current.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["route", /COUNT\(\*\)::int AS total_count/, "COUNT(*) AS hidden_total"],
    ["route", /WHERE \$\{filters\.join\(" AND "\)\}/, "WHERE true"],
    ["route", /LIMIT \$\$\{rowValues\.length - 1\} OFFSET \$\$\{rowValues\.length\}/, "LIMIT 500"],
    ["route", /total_count: result\.total_count/, "total_count: 0"],
    ["api", /(export function getSafetyFines[\s\S]*?)if \(params\.limit != null\) qs\.set\("limit", String\(params\.limit\)\);/, "$1"],
    ["page", /offset: page \* pageSize/, "offset: 0"],
    ["page", /hidePager/, "showPager"],
    ["page", /data-testid="external-fines-server-pager"/, "data-testid=\"missing-pager\""],
  ];
  let caught = 0;
  for (const [key, pattern, replacement] of mutations) {
    const fixture = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (failures(fixture).length) caught += 1;
  }
  if (caught !== mutations.length) throw new Error(`selftest caught ${caught}/${mutations.length}`);
  console.log(`PASS(selftest): ${caught}/${mutations.length} safety-fines range mutations detected`);
  process.exit(0);
}

console.log("PASS: Safety Fines exposes complete scoped server-paged history");
