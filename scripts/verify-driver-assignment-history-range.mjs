#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const files = {
  routes: fs.readFileSync("apps/backend/src/dispatch/arch-tabs.routes.ts", "utf8"),
  service: fs.readFileSync("apps/backend/src/dispatch/arch-tabs.service.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/dispatch.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/components/drivers/LoadHistoryTab.tsx", "utf8"),
};

export function check(source) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(/limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)/.test(source.routes), "route must validate bounded limit");
  need(/offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(source.routes), "route must validate offset");
  need(/SELECT count\(\*\)::int AS total_count[\s\S]{0,300}dispatch\.load_assignment_history/.test(source.service), "service must count the scoped filtered history");
  need(/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/.test(source.service), "service must apply requested limit/offset");
  need(/return \{ rows: res\.rows, total_count: Number\(countRes\.rows\[0\]\?\.total_count \?\? 0\) \}/.test(source.service), "service must return exact total_count");
  need(/filters\?: \{[\s\S]{0,180}limit\?: number; offset\?: number/.test(source.api) && /apiRequest<\{ rows: DispatchAssignmentHistoryRow\[\]; total_count: number \}>/.test(source.api), "client must type page inputs and exact total");
  need(/limit: historyPageSize,[\s\S]{0,100}offset: \(historyPage - 1\) \* historyPageSize/.test(source.page), "page must request selected offset");
  need(/historyTotal = historyQ\.isError \? 0 : historyQ\.data\?\.total_count \?\? 0/.test(source.page), "page must consume total without stale rows on failure");
  need(/data-testid="driver-load-history-server-pager"/.test(source.page) && /pageSize=\{historyPageSize\}[\s\S]{0,120}\bhidePager\b/.test(source.page), "page must render one server-total pager");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...files, service: files.service.replace("SELECT count(*)::int AS total_count", "SELECT 0::int AS hidden_count") },
    { ...files, service: files.service.replace(/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/, "LIMIT 200") },
    { ...files, api: files.api.replace("rows: DispatchAssignmentHistoryRow[]; total_count: number", "rows: DispatchAssignmentHistoryRow[]") },
    { ...files, page: files.page.replace('data-testid="driver-load-history-server-pager"', 'data-testid="removed-pager"') },
  ];
  const escaped = mutations.map((mutation, index) => ({ index, failures: check(mutation) })).filter((result) => result.failures.length === 0);
  if (escaped.length) {
    console.error(`FAIL(selftest): assignment-history range mutation(s) escaped detection: ${escaped.map((result) => result.index + 1).join(", ")}`);
    process.exit(1);
  }
  console.log(`PASS(selftest): ${mutations.length}/${mutations.length} assignment-history range mutations detected`);
  process.exit(0);
}

const failures = check(files);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("PASS: Driver assignment history exposes its complete scoped range through one server pager");
