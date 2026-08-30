#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","connectivity"],"leafRe":"^queues\\.in_transit$","task":"THEATER-INTRANSIT-DRIVER-LEAFRE","vertical":"column-wave"} */
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","reverse_link"],"leafRe":"^profiles\\.detail$","task":"THEATER-INTRANSIT-DRIVER-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-intransit-issue-driver-linkage";
const files = {
  api: "apps/frontend/src/api/dispatch.ts",
  route: "apps/backend/src/dispatch/arch-tabs.routes.ts",
  service: "apps/backend/src/dispatch/arch-tabs.service.ts",
  reverse: "apps/frontend/src/components/dispatch/DriverInTransitIssuesReverseSection.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  writer: "apps/backend/src/dispatch/intransit-issues.routes.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/assigned_primary_driver_id/.test(s.service) || !/const driverId = body\.driver_id \?\? load\.assigned_primary_driver_id/.test(s.service)) failures.push("writer must derive driver FK from selected load assignment");
  if (!/if \(!driverId \|\| !unitId\) return \{ ok: false as const, error: "load_missing_assignment" \}/.test(s.service)) failures.push("writer must reject missing derived assignment");
  if (!/issue_driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route) || !/driver_id:\s*query\.data\.issue_driver_id/.test(s.route)) failures.push("exact driver filter route contract missing");
  if (!/filters:\s*\{[^}]*driver_id\?: string[^}]*\}\s*=\s*\{\}/.test(s.service) || !/i\.driver_id = \$\$\{values\.length\}::uuid/.test(s.service)) failures.push("exact server-side driver filter missing");
  if (!/filters\.driver_id[\s\S]{0,120}q\.set\("issue_driver_id", filters\.driver_id\)/.test(s.api)) failures.push("frontend exact driver query parameter missing");
  if (!/listDispatchIntransitIssues\(operatingCompanyId, \{ driver_id: driverId \}\)/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/No in-transit issues linked to this driver/.test(s.reverse)) failures.push("honest driver reverse section missing");
  if (!/kind="load"/.test(s.reverse) || !/kind="unit"/.test(s.reverse)) failures.push("reverse rows must drill to load and unit");
  if (!/DriverInTransitIssuesReverseSection[\s\S]{0,140}driverId=\{id\}/.test(s.profile)) failures.push("driver profile reverse mount missing");
  if (!/JOIN mdata\.drivers d[\s\S]{0,360}(?:d\.operating_company_id = l\.operating_company_id|l\.operating_company_id = d\.operating_company_id)[\s\S]{0,320}driver_company_authorizations issue_driver_dca[\s\S]{0,220}issue_driver_dca\.company_id = l\.operating_company_id/.test(s.writer)) failures.push("driver self-issue lookup must bind home or actively authorized company to the assigned load");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["derive", "service", /const driverId = body\.driver_id \?\? load\.assigned_primary_driver_id/, "const driverId = body.driver_id"],
    ["assignment", "service", /if \(!driverId \|\| !unitId\) return \{ ok: false as const, error: "load_missing_assignment" \}/, ""],
    ["route", "route", /driver_id:\s*query\.data\.issue_driver_id/, "driver_id: undefined"],
    ["filter-contract", "service", /filters:\s*\{ status\?: string; issue_id\?: string; load_id\?: string; driver_id\?: string; unit_id\?: string \}/, "filters: { status?: string; issue_id?: string; load_id?: string; unit_id?: string }"],
    ["filter", "service", /i\.driver_id = \$\$\{values\.length\}::uuid/, "TRUE"],
    ["api", "api", /q\.set\("issue_driver_id", filters\.driver_id\)/, 'q.set("status", filters.driver_id)'],
    ["reverse", "reverse", /driver_id: driverId/, "driver_id: operatingCompanyId"],
    ["load-drill", "reverse", /kind="load"/, 'kind="driver"'],
    ["unit-drill", "reverse", /kind="unit"/, 'kind="driver"'],
    ["mount", "profile", /DriverInTransitIssuesReverseSection/g, "MissingIssueReverse"],
    ["writer-company", "writer", /l\.operating_company_id = d\.operating_company_id/, "TRUE"],
    ["writer-shared-company", "writer", /issue_driver_dca\.company_id = l\.operating_company_id/, "issue_driver_dca.company_id = d.operating_company_id"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — load-derived driver writer→exact reverse route→driver profile drills`);
