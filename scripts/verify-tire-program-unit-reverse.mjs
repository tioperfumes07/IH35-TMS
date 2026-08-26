#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","fleet","inventory"],"cols":["unit","connectivity","reverse_link","picker_law"],"leafRe":"^tires\\.(create|create_record)$|^unit\\.detail\\.tires$|^unit\\.profile\\.maintenance$","task":"THEATER-TIRE-PROGRAM-UNIT-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-tire-program-unit-reverse";
const files = {
  creator: "apps/frontend/src/pages/maintenance/TireProgramPage.tsx",
  route: "apps/backend/src/maintenance/tires.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  reverse: "apps/frontend/src/components/maintenance/UnitTireProgramReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  detail: "apps/frontend/src/pages/units/UnitDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/kind=\{assetKind\}/.test(s.creator) || !/input\.assetKind === "trailer" \? \{ equipment_id: input\.assetId \} : \{ unit_id: input\.assetId \}/.test(s.creator) || !/createMaintenanceTireRecord\(\{[\s\S]{0,220}operating_company_id: input\.companyId/.test(s.creator)) failures.push("asset picker-to-record payload missing");
  if (!/assetBelongsToCompany\(client, body\.operating_company_id, body\.unit_id, body\.equipment_id\)/.test(s.route)) failures.push("writer asset scope validation missing");
  if (!/\/api\/v1\/maintenance\/tires\/layout[\s\S]{0,750}tr\.operating_company_id = \$1::uuid[\s\S]{0,300}tr\.unit_id = \$\$\{values\.length\}/.test(s.route) || !/\/api\/v1\/maintenance\/tires\/layout[\s\S]{0,750}tr\.status = 'active'/.test(s.route)) failures.push("exact active unit layout reverse filter missing");
  if (!/getMaintenanceTireLayout\(operatingCompanyId, \{ unit_id: unitId \}\)/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/No tire records mounted to this unit/.test(s.reverse)) failures.push("honest unit tire reverse missing");
  if (!/kind="tire_program_unit"/.test(s.reverse) || !/id=\{unitId\}/.test(s.reverse)) failures.push("reverse must drill via EntityLink tire_program_unit");
  if (!/UnitTireProgramReverseSection[\s\S]{0,140}unitId=\{id\}/.test(s.profile)) failures.push("vehicle profile mount missing");
  if (!/UnitTireProgramReverseSection[\s\S]{0,140}unitId=\{id\}/.test(s.detail)) failures.push("secondary unit detail mount missing");
  if (!/export function getMaintenanceTireLayout/.test(s.api) || !/\/api\/v1\/maintenance\/tires\/layout\?/.test(s.api)) failures.push("canonical layout API missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /kind=\{assetKind\}/, 'kind="driver"'],
    ["payload", "creator", /input\.assetKind === "trailer" \? \{ equipment_id: input\.assetId \} : \{ unit_id: input\.assetId \}/, "{ unit_id: undefined }"],
    ["writer", "route", /assetBelongsToCompany\(client, body\.operating_company_id, body\.unit_id, body\.equipment_id\)/, "true"],
    ["company", "route", /(\/api\/v1\/maintenance\/tires\/layout[\s\S]{0,750})tr\.operating_company_id = \$1::uuid/, "$1TRUE"],
    ["filter", "route", /(\/api\/v1\/maintenance\/tires\/layout[\s\S]{0,950})tr\.unit_id = \$\$\{values\.length\}/, "$1TRUE"],
    ["active", "route", /(\/api\/v1\/maintenance\/tires\/layout[\s\S]{0,750})tr\.status = 'active'/, "$1TRUE"],
    ["reverse", "reverse", /unit_id: unitId/, "unit_id: operatingCompanyId"],
    ["drill", "reverse", /kind="tire_program_unit"/, 'kind="unit"'],
    ["profile", "profile", /UnitTireProgramReverseSection/g, "MissingTireReverse"],
    ["detail", "detail", /UnitTireProgramReverseSection/g, "MissingTireReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — asset picker→scoped tire writer→exact unit layout→both unit routes`);
