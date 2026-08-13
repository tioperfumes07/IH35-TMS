#!/usr/bin/env node
/** @matrix-built modules=maintenance,fleet cols=unit,connectivity,reverse_link,picker_law */
import fs from "node:fs";
const LABEL = "verify-pm-schedule-unit-linkage";
const files = {
  route: "apps/backend/src/maintenance/pm-schedule.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  page: "apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx",
  reverse: "apps/frontend/src/components/maintenance/UnitPmSchedulesReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/kind="unit"[\s\S]{0,500}dataTestId="pm-schedule-unit"/.test(s.page)) failures.push("canonical unit picker missing");
  if (!/unit_id:\s*unitId/.test(s.page)) failures.push("create payload must forward selected unit");
  if (!/FROM mdata\.units[\s\S]{0,220}COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL/.test(s.route)) failures.push("writer must validate active lease/owner-scoped unit");
  if (!/INSERT INTO maintenance\.pm_schedules[\s\S]{0,180}operating_company_id, unit_id/.test(s.route)) failures.push("writer must persist unit FK");
  if (!/filters\.push\(`s\.unit_id = \$\$\{values\.length\}`\)/.test(s.route)) failures.push("backend exact unit filter missing");
  if (!/params\.unit_id\) query\.set\("unit_id", params\.unit_id\)/.test(s.api)) failures.push("frontend exact unit filter missing");
  if (!/listMaintenancePmSchedules\(operatingCompanyId, \{ unit_id: unitId \}\)/.test(s.reverse) || !/ListErrorBanner/.test(s.reverse)) failures.push("reverse section must use exact filter and honest error state");
  if (!/pm-schedule\?schedule_id=/.test(s.reverse) || !/row\.id === highlightedScheduleId/.test(s.page)) failures.push("reverse rows must drill to highlighted canonical schedule");
  if (!/UnitPmSchedulesReverseSection[\s\S]{0,160}unitId=\{id\}/.test(s.profile)) failures.push("unit profile reverse mount missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "page", /(<EntityPicker[\s\S]{0,100})kind="unit"/, '$1kind="driver"'],
    ["payload", "page", /unit_id:\s*unitId/, "unit_id: NIL_UUID"],
    ["scope", "route", /COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/, "TRUE"],
    ["active", "route", /deactivated_at IS NULL/, "TRUE"],
    ["filter", "route", /filters\.push\(`s\.unit_id = \$\$\{values\.length\}`\)/, "filters.push(`TRUE`)"],
    ["api", "api", /query\.set\("unit_id", params\.unit_id\)/, 'query.set("status", params.unit_id)'],
    ["reverse", "reverse", /listMaintenancePmSchedules\(operatingCompanyId, \{ unit_id: unitId \}\)/, "listMaintenancePmSchedules(operatingCompanyId)"],
    ["drill", "reverse", /pm-schedule\?schedule_id=/, "pm-schedule?unit_id="],
    ["mount", "profile", /UnitPmSchedulesReverseSection/g, "MissingPmReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — unit picker→tenant writer→exact unit reverse→highlighted PM drill`);
