#!/usr/bin/env node
/** @matrix-built {"modules":["safety","drivers"],"cols":["driver","connectivity","reverse_link","picker_law"],"leaves":["driver_scheduler.list","profiles.detail"],"task":"TEMP-COVER-DRIVER-EXACT-LEAVES","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-temp-cover-driver-linkage";
const files = {
  creator: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx",
  service: "apps/backend/src/safety/driver-scheduler.service.ts",
  routes: "apps/backend/src/safety/driver-scheduler.routes.ts",
  api: "apps/frontend/src/api/driver-scheduler.ts",
  reverse: "apps/frontend/src/components/safety/DriverTempCoverReverseSection.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  detail: "apps/frontend/src/pages/DriverDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  const listTempSignature = s.api.match(/listTempAssignments\([\s\S]{0,260}?\)\s*\{/)?.[0] ?? "";
  const routeStart = s.routes.indexOf('"/api/v1/safety/scheduler/temp-assignments"');
  const routeEnd = s.routes.indexOf('app.post("/api/v1/safety/scheduler/temp-assignments"', routeStart);
  const listRoute = s.routes.slice(routeStart, routeEnd);
  if ((s.creator.match(/<DriverPickerWithCreate/g) ?? []).length < 2 || !/primary_driver_id: input\.form\.primaryDriverId/.test(s.creator) || !/cover_driver_id: input\.form\.coverDriverId/.test(s.creator)) failures.push("primary/cover picker payload missing");
  if (!/input\.primary_driver_id === input\.cover_driver_id/.test(s.service) || !/const drivers = await client\.query[\s\S]{0,260}FROM mdata\.drivers[\s\S]{0,160}operating_company_id = \$1::uuid[\s\S]{0,100}deactivated_at IS NULL/.test(s.service) || !/temp_cover_driver_not_found/.test(s.service)) failures.push("active tenant driver validation missing");
  if ((s.service.match(/\(\$2::uuid IS NULL OR t\.primary_driver_id = \$2::uuid OR t\.cover_driver_id = \$2::uuid\)/g) ?? []).length < 2) failures.push("exact either-role driver reverse filter missing from count or list query");
  if (!/driver_id: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.routes) || !/driverId: parsed\.data\.driver_id/.test(s.routes)) failures.push("route driver filter contract missing");
  if (!/dca\.company_id = \$2::uuid[\s\S]{0,180}dca\.is_authorized = true[\s\S]{0,180}dca\.deactivated_at IS NULL/.test(listRoute)) failures.push("exact driver filter must validate owned or authorized parent");
  if (!/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(listRoute)) failures.push("invalid exact driver must not render as empty assignments");
  if (!/pd_dca\.company_id = t\.operating_company_id[\s\S]{0,180}pd_dca\.is_authorized = true/.test(s.service) || !/cd_dca\.company_id = t\.operating_company_id[\s\S]{0,180}cd_dca\.is_authorized = true/.test(s.service)) failures.push("authorized shared primary/cover driver labels missing");
  if (!listTempSignature.includes("driver_id?: string") || !/driver_id: driverId/.test(s.creator)) failures.push("frontend filtered list contract missing");
  if (!/listTempAssignments\(operatingCompanyId, \{ driver_id: driverId \}\)/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/No active temporary assignments are linked to this driver/.test(s.reverse)) failures.push("honest driver reverse missing");
  if (!/<EntityLinkOrTombstone kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number\} noun="Unit" \/>/.test(s.reverse)) failures.push("temporary assignment unit canonical drill missing");
  if (!(/kind="driver_scheduler_driver"/.test(s.reverse) || /safety\/driver-scheduler\?driver_id=/.test(s.reverse))) {
    failures.push("canonical filtered scheduler drill missing");
  }
  if (!/DriverTempCoverReverseSection[\s\S]{0,140}driverId=\{id\}/.test(s.profile) || !/DriverTempCoverReverseSection[\s\S]{0,180}driverId=\{id\}/.test(s.detail)) failures.push("both driver profile mounts missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /<DriverPickerWithCreate/, "<MissingDriverPicker"],
    ["primary", "creator", /primary_driver_id: input\.form\.primaryDriverId/, "primary_driver_id: undefined"],
    ["distinct", "service", /input\.primary_driver_id === input\.cover_driver_id/, "false"],
    ["scope", "service", /(const drivers = await client\.query[\s\S]{0,260})operating_company_id = \$1::uuid/, "$1TRUE"],
    ["active", "service", /(const drivers = await client\.query[\s\S]{0,320})deactivated_at IS NULL/, "$1TRUE"],
    ["filter", "service", /\(\$2::uuid IS NULL OR t\.primary_driver_id = \$2::uuid OR t\.cover_driver_id = \$2::uuid\)/, "TRUE"],
    ["route", "routes", /driverId: parsed\.data\.driver_id/, "driverId: undefined"],
    ["parent-auth", "routes", /(\/api\/v1\/safety\/scheduler\/temp-assignments[\s\S]{0,2500})dca\.is_authorized = true/, "$1TRUE"],
    ["parent-404", "routes", /(\/api\/v1\/safety\/scheduler\/temp-assignments[\s\S]{0,4000})if \(!result\.found\) return reply\.code\(404\)/, "$1if (false) return reply.code(404)"],
    ["primary-label", "service", /pd_dca\.is_authorized = true/, "TRUE"],
    ["cover-label", "service", /cd_dca\.is_authorized = true/, "TRUE"],
    ["api-filter", "api", /driver_id\?: string/, "removed_driver_filter?: string"],
    ["reverse", "reverse", /driver_id: driverId/, "driver_id: operatingCompanyId"],
    ["unit-drill", "reverse", /<EntityLinkOrTombstone kind="unit"/, '<EntityLinkOrTombstone kind="driver"'],
    ["profile", "profile", /DriverTempCoverReverseSection/g, "MissingTempCoverReverse"],
    ["detail", "detail", /DriverTempCoverReverseSection/g, "MissingTempCoverReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — primary/cover pickers→active tenant drivers→either-role exact reverse→both profiles`);
