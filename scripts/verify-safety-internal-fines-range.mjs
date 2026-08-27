#!/usr/bin/env node
import fs from "node:fs";

const source = {
  route: fs.readFileSync("apps/backend/src/safety/safety-v5.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/safety/InternalFinesPage.tsx", "utf8"),
};

function failures(input) {
  const out = [];
  const apiBlock = input.api.match(/export function getInternalFines[\s\S]*?export function disputeInternalFine/)?.[0] ?? "";
  if (!/limit:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)/.test(input.route)) out.push("limit schema");
  if (!/offset:\s*z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(input.route)) out.push("offset schema");
  if (!/COUNT\(\*\)::int AS total_count[\s\S]{0,240}?FROM safety\.internal_fines f[\s\S]{0,240}?f\.operating_company_id = \$1::uuid[\s\S]{0,120}?\$\{driverFilter\}[\s\S]{0,120}?\$\{loadFilter\}/.test(input.route)) out.push("scoped exact count");
  if (!/LIMIT \$\$\{rowValues\.length - 1\} OFFSET \$\$\{rowValues\.length\}/.test(input.route)) out.push("server range");
  if (!/return \{ fines: result\.rows, total_count: result\.total_count \}/.test(input.route)) out.push("response total");
  if (!/limit\?: number; offset\?: number/.test(apiBlock) || !/qs\.set\("limit"/.test(apiBlock) || !/total_count: number/.test(apiBlock)) out.push("API contract");
  if (!/getInternalFines\([\s\S]{0,260}?limit: pageSize,[\s\S]{0,80}?offset: page \* pageSize/.test(input.page)) out.push("page range request");
  if (!/hidePager/.test(input.page) || !/data-testid="internal-fines-server-pager"/.test(input.page)) out.push("single exact pager");
  if (!/query\.isError[\s\S]{0,180}?ListErrorBanner[\s\S]{0,180}?query\.refetch/.test(input.page)) out.push("retryable error exclusion");
  return out;
}

const current = failures(source);
if (current.length) { console.error(`FAIL: ${current.join(", ")}`); process.exit(1); }

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["route", /COUNT\(\*\)::int AS total_count/, "COUNT(*) AS hidden"],
    ["route", /f\.operating_company_id = \$1::uuid/, "true"],
    ["route", /\$\{driverFilter\}/, ""],
    ["route", /\$\{loadFilter\}/, ""],
    ["route", /LIMIT \$\$\{rowValues\.length - 1\} OFFSET \$\$\{rowValues\.length\}/, "LIMIT 500"],
    ["route", /total_count: result\.total_count/, "total_count: 0"],
    ["page", /offset: page \* pageSize/, "offset: 0"],
    ["page", /hidePager/, "showPager"],
    ["page", /data-testid="internal-fines-server-pager"/, "data-testid=\"missing-pager\""],
    ["page", /onRetry=\{\(\) => void query\.refetch\(\)\}/, "onRetry={() => undefined}"],
  ];
  let caught = 0;
  for (const [key, pattern, replacement] of mutations) {
    const fixture = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (failures(fixture).length) caught += 1;
  }
  if (caught !== mutations.length) throw new Error(`selftest caught ${caught}/${mutations.length}`);
  console.log(`PASS(selftest): ${caught}/${mutations.length} internal-fines range mutations detected`);
  process.exit(0);
}

console.log("PASS: Internal Fines exposes complete scoped server-paged history");
