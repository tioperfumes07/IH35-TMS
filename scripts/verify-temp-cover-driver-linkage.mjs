#!/usr/bin/env node
/** @matrix-built {"modules":["safety","drivers"],"cols":["driver","connectivity","reverse_link","picker_law"],"leafRe":"^driver_scheduler\\.list$|^profiles\\.detail$","task":"THEATER-TEMP-COVER-DRIVER-LEAFRE","vertical":"column-wave"} */
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
  if ((s.creator.match(/<DriverPickerWithCreate/g) ?? []).length < 2 || !/primary_driver_id: tempCoverForm\.primaryDriverId/.test(s.creator) || !/cover_driver_id: tempCoverForm\.coverDriverId/.test(s.creator)) failures.push("primary/cover picker payload missing");
  if (!/input\.primary_driver_id === input\.cover_driver_id/.test(s.service) || !/const drivers = await client\.query[\s\S]{0,260}FROM mdata\.drivers[\s\S]{0,160}operating_company_id = \$1::uuid[\s\S]{0,100}deactivated_at IS NULL/.test(s.service) || !/temp_cover_driver_not_found/.test(s.service)) failures.push("active tenant driver validation missing");
  if (!/\(\$2::uuid IS NULL OR t\.primary_driver_id = \$2::uuid OR t\.cover_driver_id = \$2::uuid\)/.test(s.service)) failures.push("exact either-role driver reverse filter missing");
  if (!/driver_id: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.routes) || !/driverId: parsed\.data\.driver_id/.test(s.routes)) failures.push("route driver filter contract missing");
  if (!/listTempAssignments\(operatingCompanyId: string, filters: \{ driver_id\?: string(?:; unit_id\?: string)? \}/.test(s.api) || !/driver_id: driverId/.test(s.creator)) failures.push("frontend filtered list contract missing");
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
    ["primary", "creator", /primary_driver_id: tempCoverForm\.primaryDriverId/, "primary_driver_id: undefined"],
    ["distinct", "service", /input\.primary_driver_id === input\.cover_driver_id/, "false"],
    ["scope", "service", /(const drivers = await client\.query[\s\S]{0,260})operating_company_id = \$1::uuid/, "$1TRUE"],
    ["active", "service", /(const drivers = await client\.query[\s\S]{0,320})deactivated_at IS NULL/, "$1TRUE"],
    ["filter", "service", /\(\$2::uuid IS NULL OR t\.primary_driver_id = \$2::uuid OR t\.cover_driver_id = \$2::uuid\)/, "TRUE"],
    ["route", "routes", /driverId: parsed\.data\.driver_id/, "driverId: undefined"],
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
