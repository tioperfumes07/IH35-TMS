#!/usr/bin/env node
/** @matrix-built {"modules":["drivers","fleet"],"cols":["driver","unit","connectivity","reverse_link","picker_law"],"leafRe":"^drivers\\.modal\\.assign_truck$|^unit\\.profile\\.driver_assign$|^profiles\\.detail$","task":"THEATER-DEFAULT-TRUCK-UNIT-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-default-truck-unit-reverse";
const files = {
  creator: "apps/frontend/src/components/driver-profile/AssignTruckModal.tsx",
  api: "apps/frontend/src/api/mdata.ts",
  route: "apps/backend/src/mdata/driver-default-truck.routes.ts",
  reverse: "apps/frontend/src/components/fleet/UnitDefaultDriversReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  detail: "apps/frontend/src/pages/units/UnitDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/kind="unit"[\s\S]{0,180}value=\{unitId \|\| null\}/.test(s.creator) || !/setDriverDefaultTruck\(driverId, companyId, unitId\)/.test(s.creator)) failures.push("unit picker-to-writer path missing");
  if (!/app\.post\("\/api\/v1\/mdata\/drivers\/:id\/default-truck"[\s\S]{0,1200}assertDriverScope\(client, params\.data\.id[\s\S]{0,300}assertUnitScope\(client, body\.data\.unit_id/.test(s.route)) failures.push("forward writer driver/unit scope checks missing");
  if (!/\/api\/v1\/mdata\/units\/:id\/default-drivers[\s\S]{0,2200}vda\.unit_id = \$1::uuid[\s\S]{0,180}vda\.operating_company_id = \$2::uuid[\s\S]{0,180}vda\.ended_at IS NULL/.test(s.route)) failures.push("exact active unit reverse route missing");
  if (!/listUnitDefaultDrivers\(unitId, operatingCompanyId\)/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/No active default driver assigned to this unit/.test(s.reverse)) failures.push("honest unit reverse states missing");
  if (!/<ListErrorState[\s\S]{0,260}onRetry=\{\(\) => void query\.refetch\(\)\}/.test(s.reverse)) failures.push("failed unit reverse must expose exact-query retry");
  if (!/kind="driver"/.test(s.reverse)) failures.push("reverse rows must drill to driver");
  if (!/UnitDefaultDriversReverseSection[\s\S]{0,140}unitId=\{id\}/.test(s.profile)) failures.push("vehicle profile mount missing");
  if (!/UnitDefaultDriversReverseSection[\s\S]{0,140}unitId=\{id\}/.test(s.detail)) failures.push("secondary unit detail mount missing");
  if (!/listUnitDefaultDrivers[\s\S]{0,220}default-drivers\?operating_company_id/.test(s.api)) failures.push("frontend reverse API missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /kind="unit"([\s\S]{0,180}value=\{unitId \|\| null\})/, 'kind="driver"$1'],
    ["payload", "creator", /setDriverDefaultTruck\(driverId, companyId, unitId\)/, "setDriverDefaultTruck(driverId, companyId, driverId)"],
    ["driver-scope", "route", /(app\.post\("\/api\/v1\/mdata\/drivers\/:id\/default-truck"[\s\S]{0,1200})assertDriverScope\(client, params\.data\.id/, "$1assertDriverScope(client, body.data.unit_id"],
    ["unit-scope", "route", /(app\.post\("\/api\/v1\/mdata\/drivers\/:id\/default-truck"[\s\S]{0,1500})assertUnitScope\(client, body\.data\.unit_id/, "$1assertUnitScope(client, params.data.id"],
    ["filter", "route", /(\/api\/v1\/mdata\/units\/:id\/default-drivers[\s\S]{0,2200})vda\.unit_id = \$1::uuid/, "$1TRUE"],
    ["company", "route", /(\/api\/v1\/mdata\/units\/:id\/default-drivers[\s\S]{0,2400})vda\.operating_company_id = \$2::uuid/, "$1TRUE"],
    ["active", "route", /(\/api\/v1\/mdata\/units\/:id\/default-drivers[\s\S]{0,2600})vda\.ended_at IS NULL/, "$1TRUE"],
    ["reverse", "reverse", /listUnitDefaultDrivers\(unitId, operatingCompanyId\)/, "listUnitDefaultDrivers(operatingCompanyId, operatingCompanyId)"],
    ["retry", "reverse", /onRetry=\{\(\) => void query\.refetch\(\)\}/, "onRetry={() => undefined}"],
    ["drill", "reverse", /kind="driver"/, 'kind="unit"'],
    ["profile", "profile", /UnitDefaultDriversReverseSection/g, "MissingDefaultDrivers"],
    ["detail", "detail", /UnitDefaultDriversReverseSection/g, "MissingDefaultDrivers"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — unit picker→scoped assignment writer→exact unit reverse→driver drill`);
