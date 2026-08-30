#!/usr/bin/env node
/** @matrix-built {"modules":["safety","fleet"],"cols":["unit","connectivity","reverse_link","picker_law"],"leaves":["driver_scheduler.list","unit.profile.safety_reverse"],"task":"TEMP-COVER-UNIT-EXACT-LEAVES","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-temp-cover-unit-linkage";
const files = {
  creator: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx",
  service: "apps/backend/src/safety/driver-scheduler.service.ts",
  routes: "apps/backend/src/safety/driver-scheduler.routes.ts",
  api: "apps/frontend/src/api/driver-scheduler.ts",
  reverse: "apps/frontend/src/components/safety/UnitTempCoverReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  detail: "apps/frontend/src/pages/units/UnitDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  const listStart = s.api.indexOf("listTempAssignments(");
  const listEnd = listStart >= 0 ? s.api.indexOf("= {},", listStart) : -1;
  const listSignature = listStart >= 0 && listEnd > listStart ? s.api.slice(listStart, listEnd) : "";
  if (!/<EntityPicker[\s\S]{0,120}kind="unit"/.test(s.creator) || !/unit_id: input\.form\.unitId/.test(s.creator)) failures.push("unit picker-to-assignment payload missing");
  if (!/const unit = await client\.query[\s\S]{0,260}FROM mdata\.units[\s\S]{0,160}COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$1::uuid[\s\S]{0,100}deactivated_at IS NULL/.test(s.service) || !/temp_cover_unit_not_found/.test(s.service)) failures.push("active tenant unit validation missing");
  const unitFilterCount = [...s.service.matchAll(/\(\$3::uuid IS NULL OR t\.unit_id = \$3::uuid\)/g)].length;
  if (unitFilterCount !== 2) failures.push("both row and count queries must retain the exact unit reverse filter");
  if (!/unit_id: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.routes) || !/unitId: parsed\.data\.unit_id/.test(s.routes)) failures.push("route unit filter contract missing");
  if (!/operatingCompanyId:\s*string/.test(listSignature) || !/driver_id\?:\s*string/.test(listSignature) || !/unit_id\?:\s*string/.test(listSignature) || !/unit_id: unitId/.test(s.creator)) failures.push("frontend filtered list contract missing");
  if (!/listTempAssignments\(operatingCompanyId, \{ unit_id: unitId \}\)/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/No active temporary driver coverage is linked to this unit/.test(s.reverse)) failures.push("honest unit reverse missing");
  if (!(/kind="driver_scheduler_unit"/.test(s.reverse) || /safety\/driver-scheduler\?unit_id=/.test(s.reverse))) {
    failures.push("canonical filtered scheduler drill missing");
  }
  if (!/UnitTempCoverReverseSection[\s\S]{0,140}unitId=\{id\}/.test(s.profile) || !/UnitTempCoverReverseSection[\s\S]{0,140}unitId=\{id\}/.test(s.detail)) failures.push("both unit profile mounts missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /(<EntityPicker[\s\S]{0,120})kind="unit"/, '$1kind="driver"'],
    ["payload", "creator", /unit_id: input\.form\.unitId/, "unit_id: undefined"],
    ["scope", "service", /(const unit = await client\.query[\s\S]{0,260})COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$1::uuid/, "$1TRUE"],
    ["active", "service", /(const unit = await client\.query[\s\S]{0,320})deactivated_at IS NULL/, "$1TRUE"],
    ["filter", "service", /\(\$3::uuid IS NULL OR t\.unit_id = \$3::uuid\)/, "TRUE"],
    ["route", "routes", /unitId: parsed\.data\.unit_id/, "unitId: undefined"],
    ["api", "api", /unit_id\?: string/, "wrong_id?: string"],
    ["reverse", "reverse", /unit_id: unitId/, "unit_id: operatingCompanyId"],
    ["profile", "profile", /UnitTempCoverReverseSection/g, "MissingTempCoverReverse"],
    ["detail", "detail", /UnitTempCoverReverseSection/g, "MissingTempCoverReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — unit picker→active tenant unit→exact reverse→both unit routes`);
