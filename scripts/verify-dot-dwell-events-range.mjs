#!/usr/bin/env node
import fs from "node:fs";

const source = {
  route: fs.readFileSync("apps/backend/src/safety/dot-inspection-events.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx", "utf8"),
};

function failures(input) {
  const out = [];
  const apiBlock = input.api.match(/export function listDotInspectionEvents[\s\S]*?export function followUpDotInspectionEvent/)?.[0] ?? "";
  if (!/limit:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)\.default\(20\)/.test(input.route)) out.push("limit schema");
  if (!/offset:\s*z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(input.route)) out.push("offset schema");
  if (!/COUNT\(\*\) OVER\(\)::int AS total_count/.test(input.route)) out.push("exact window total");
  if (!/LIMIT \$\$\{params\.length - 1\} OFFSET \$\$\{params\.length\}/.test(input.route)) out.push("server range");
  if (!/return \{ events: events\.rows, total_count: events\.total_count \}/.test(input.route)) out.push("response total");
  if (!/range: \{ limit\?: number; offset\?: number \}/.test(apiBlock) || !/qs\.set\("offset"/.test(apiBlock) || !/total_count: number/.test(apiBlock)) out.push("API range contract");
  if (!/listDotInspectionEvents\(companyId, "open", \{ limit: dwellPageSize, offset: dwellPage \* dwellPageSize \}\)/.test(input.page)) out.push("mounted range request");
  if (/\.slice\(0,\s*20\)/.test(input.page)) out.push("client truncation");
  if (!/data-testid="dot-dwell-events-server-pager"/.test(input.page)) out.push("exact pager");
  if (!/title="Couldn't load DOT station dwell events"[\s\S]{0,220}?openEventsQuery\.refetch/.test(input.page)) out.push("retryable error");
  return out;
}

const current = failures(source);
if (current.length) { console.error(`FAIL: ${current.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["window-total", "route", /COUNT\(\*\) OVER\(\)::int AS total_count/, "0 AS total_count"],
    ["server-range", "route", /LIMIT \$\$\{params\.length - 1\} OFFSET \$\$\{params\.length\}/, "LIMIT 500"],
    ["response-total", "route", /total_count: events\.total_count/, "total_count: 0"],
    ["api-offset", "api", /(export function listDotInspectionEvents[\s\S]*?)qs\.set\("offset", String\(range\.offset\)\)/, "$1qs.delete(\"offset\")"],
    ["mounted-offset", "page", /offset: dwellPage \* dwellPageSize/, "offset: 0"],
    ["client-truncation", "page", /\(openEventsQuery\.data\?\.events \?\? \[\]\)\.map/, "(openEventsQuery.data?.events ?? []).slice(0, 20).map"],
    ["pager", "page", /data-testid="dot-dwell-events-server-pager"/, "data-testid=\"missing-pager\""],
    ["retry", "page", /onRetry=\{\(\) => void openEventsQuery\.refetch\(\)\}/, "onRetry={() => undefined}"],
  ];
  let caught = 0;
  const survived = [];
  for (const [name, key, pattern, replacement] of mutations) {
    const fixture = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (failures(fixture).length) caught += 1;
    else survived.push(name);
  }
  if (caught !== mutations.length) throw new Error(`selftest caught ${caught}/${mutations.length}; survived: ${survived.join(", ")}`);
  console.log(`PASS(selftest): ${caught}/${mutations.length} DOT dwell range mutations detected`);
  process.exit(0);
}
console.log("PASS: mounted DOT dwell queue is complete, paged, and retryable");
