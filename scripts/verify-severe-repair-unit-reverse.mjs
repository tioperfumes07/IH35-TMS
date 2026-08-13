#!/usr/bin/env node
/** @matrix-built modules=maintenance,fleet,safety cols=unit,connectivity,reverse_link,picker_law */
import fs from "node:fs";
const LABEL = "verify-severe-repair-unit-reverse";
const files = {
  creator: "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx",
  route: "apps/backend/src/maintenance/severe-repair-estimate.routes.ts",
  service: "apps/backend/src/maintenance/severe-repair-estimate.service.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  reverse: "apps/frontend/src/components/maintenance/UnitSevereRepairsReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  detail: "apps/frontend/src/pages/units/UnitDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/<EntityPicker[\s\S]{0,120}kind="unit"/.test(s.creator) || !/markUnitOos\(selectedUnitId/.test(s.creator)) failures.push("unit picker-to-writer path missing");
  if (!/unit_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route) || !/listOpenEstimates\(client, query\.data\.operating_company_id, query\.data\.unit_id\)/.test(s.route)) failures.push("route unit filter contract missing");
  if (!/WHERE e\.operating_company_id = \$1::uuid[\s\S]{0,180}\(\$2::uuid IS NULL OR e\.unit_id = \$2::uuid\)/.test(s.service)) failures.push("entity-scoped exact unit filter missing");
  if (!/listSevereRepairEstimates\(companyId: string, filters: \{ unit_id\?: string \}/.test(s.api) || !/params\.set\("unit_id", filters\.unit_id\)/.test(s.api)) failures.push("frontend API unit filter missing");
  if (!/listSevereRepairEstimates\(operatingCompanyId, \{ unit_id: unitId \}\)/.test(s.reverse) || !/query\.isError \? <p[^>]*>Could not load severe repairs for this unit\.<\/p> : null/.test(s.reverse) || !/No open severe repairs are linked to this unit/.test(s.reverse)) failures.push("honest exact reverse section missing");
  if (!/maintenance\/severe-repairs\?unit_id=/.test(s.reverse) || !/maintenance\/work-orders\//.test(s.reverse)) failures.push("canonical filtered/list detail drills missing");
  if (!/UnitSevereRepairsReverseSection[\s\S]{0,140}unitId=\{id\}/.test(s.profile)) failures.push("vehicle profile mount missing");
  if (!/UnitSevereRepairsReverseSection[\s\S]{0,140}unitId=\{id\}/.test(s.detail)) failures.push("secondary unit detail mount missing");
  if (!/listSevereRepairEstimates\(operatingCompanyId, \{ unit_id: unitId \}\)/.test(s.creator)) failures.push("filtered canonical page missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /(<EntityPicker[\s\S]{0,120})kind="unit"/, '$1kind="driver"'],
    ["writer", "creator", /markUnitOos\(selectedUnitId/, "markUnitOos(operatingCompanyId"],
    ["route", "route", /query\.data\.unit_id/, "undefined"],
    ["scope", "service", /e\.operating_company_id = \$1::uuid/, "TRUE"],
    ["filter", "service", /\(\$2::uuid IS NULL OR e\.unit_id = \$2::uuid\)/, "TRUE"],
    ["api", "api", /params\.set\("unit_id", filters\.unit_id\)/, "void filters.unit_id"],
    ["reverse", "reverse", /unit_id: unitId/, "unit_id: operatingCompanyId"],
    ["error", "reverse", /query\.isError \? <p className="text-sm text-red-600">Could not load severe repairs for this unit\.<\/p> : null/, "null"],
    ["profile", "profile", /UnitSevereRepairsReverseSection/g, "MissingSevereReverse"],
    ["detail", "detail", /UnitSevereRepairsReverseSection/g, "MissingSevereReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — unit picker→scoped OOS writer→exact severe-repair query→both unit routes`);
