#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["unit","connectivity"],"leafRe":"^queues\\.in_transit$","task":"THEATER-INTRANSIT-UNIT-LEAFRE","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit","connectivity","reverse_link"],"leafRe":"^unit\\.profile\\.driver_assign$","task":"THEATER-INTRANSIT-UNIT-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-intransit-issue-unit-linkage";
const files = {
  api: "apps/frontend/src/api/dispatch.ts",
  route: "apps/backend/src/dispatch/arch-tabs.routes.ts",
  service: "apps/backend/src/dispatch/arch-tabs.service.ts",
  reverse: "apps/frontend/src/components/dispatch/UnitInTransitIssuesReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  detail: "apps/frontend/src/pages/units/UnitDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/assigned_unit_id/.test(s.service) || !/const unitId = body\.unit_id \?\? load\.assigned_unit_id/.test(s.service)) failures.push("writer must derive unit FK from selected load assignment");
  if (!/assigned_secondary_driver_id/.test(s.service) || !/assignedDriverIds = \[load\.assigned_primary_driver_id, load\.assigned_secondary_driver_id\]\.filter\(Boolean\)/.test(s.service)) failures.push("writer must enumerate both canonical load drivers");
  if (!/body\.driver_id && !assignedDriverIds\.includes\(body\.driver_id\)[\s\S]*driver_not_assigned_to_load/.test(s.service)) failures.push("explicit driver override must belong to the selected load");
  if (!/body\.unit_id && body\.unit_id !== load\.assigned_unit_id[\s\S]*unit_not_assigned_to_load/.test(s.service)) failures.push("explicit unit override must equal the selected load assignment");
  if (!/if \(!driverId \|\| !unitId\) return \{ ok: false as const, error: "load_missing_assignment" \}/.test(s.service)) failures.push("writer must reject missing derived assignment");
  if (!/issue_unit_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route) || !/unit_id:\s*query\.data\.issue_unit_id/.test(s.route)) failures.push("exact unit filter route contract missing");
  if (!/unit_id\?: string/.test(s.service) || !/i\.unit_id = \$\$\{values\.length\}::uuid/.test(s.service)) failures.push("exact server-side unit filter missing");
  if (!/filters\.unit_id[\s\S]{0,120}q\.set\("issue_unit_id", filters\.unit_id\)/.test(s.api)) failures.push("frontend exact unit query parameter missing");
  if (!/listDispatchIntransitIssues\(operatingCompanyId, \{ unit_id: unitId \}\)/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/No in-transit issues linked to this unit/.test(s.reverse)) failures.push("honest unit reverse section missing");
  if (!/kind="load"/.test(s.reverse) || !/kind="driver"/.test(s.reverse)) failures.push("reverse rows must drill to load and driver");
  if (!/UnitInTransitIssuesReverseSection[\s\S]{0,140}unitId=\{id\}/.test(s.profile)) failures.push("canonical vehicle profile reverse mount missing");
  if (!/UnitInTransitIssuesReverseSection[\s\S]{0,140}unitId=\{id\}/.test(s.detail)) failures.push("secondary unit detail reverse mount missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["derive", "service", /const unitId = body\.unit_id \?\? load\.assigned_unit_id/, "const unitId = body.unit_id"],
    ["assignment", "service", /if \(!driverId \|\| !unitId\) return \{ ok: false as const, error: "load_missing_assignment" \}/, ""],
    ["secondary-driver", "service", /assigned_secondary_driver_id/g, "missing_secondary_driver_id"],
    ["driver-continuity", "service", /!assignedDriverIds\.includes\(body\.driver_id\)/, "false"],
    ["unit-continuity", "service", /body\.unit_id !== load\.assigned_unit_id/, "false"],
    ["route", "route", /unit_id:\s*query\.data\.issue_unit_id/, "unit_id: undefined"],
    ["filter", "service", /i\.unit_id = \$\$\{values\.length\}::uuid/, "TRUE"],
    ["api", "api", /q\.set\("issue_unit_id", filters\.unit_id\)/, 'q.set("status", filters.unit_id)'],
    ["reverse", "reverse", /unit_id: unitId/, "unit_id: operatingCompanyId"],
    ["load-drill", "reverse", /kind="load"/, 'kind="unit"'],
    ["driver-drill", "reverse", /kind="driver"/, 'kind="unit"'],
    ["profile", "profile", /UnitInTransitIssuesReverseSection/g, "MissingIssueReverse"],
    ["detail", "detail", /UnitInTransitIssuesReverseSection/g, "MissingIssueReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — load-derived unit writer→exact reverse route→both unit profiles`);
