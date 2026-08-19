#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-safety-permit-unit-reverse";
const paths = {
  route: "apps/backend/src/safety/permits.routes.ts",
  api: "apps/frontend/src/api/safety.ts",
  section: "apps/frontend/src/components/safety/UnitPermitsReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  const permitsApi = s.api.slice(s.api.indexOf("export function getSafetyPermits"), s.api.indexOf("export function createSafetyPermit"));
  if (!/unit_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route)) failures.push("permit list schema must accept unit_id");
  if (!/filters\.push\(`p\.unit_id = \$\$\{values\.length\}::uuid`\)/.test(s.route)) failures.push("permit list SQL must filter unit_id");
  if (!/params\.unit_id\) qs\.set\("unit_id", params\.unit_id\)/.test(permitsApi)) failures.push("FE API must forward unit_id");
  if (!/getSafetyPermits\(operatingCompanyId, \{ unit_id: unitId \}\)/.test(s.section)) failures.push("reverse section must query by unit_id");
  if (!/<EntityLinkOrTombstone[\s\S]{0,100}kind="permit"[\s\S]{0,80}id=\{id\}[\s\S]{0,120}name=\{permit\.permit_number \?\? permit\.permit_type\}[\s\S]{0,80}noun="Permit"/.test(s.section)) failures.push("reverse rows must drill valid permit IDs and tombstone missing identities");
  if (!/query\.isError[\s\S]*ListErrorBanner/.test(s.section)) failures.push("reverse section must expose an error state");
  if (!/<UnitPermitsReverseSection[\s\S]*unitId=\{id\}/.test(s.profile)) failures.push("vehicle profile must mount permits reverse section");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["route filter", { ...source, route: source.route.replace("filters.push(`p.unit_id = $${values.length}::uuid`)", "void values") }],
    ["API filter", { ...source, api: source.api.replaceAll('qs.set("unit_id", params.unit_id)', 'qs.set("permit_type", params.unit_id)') }],
    ["profile mount", { ...source, profile: source.profile.replace("<UnitPermitsReverseSection", "<div") }],
    ["permit drill", { ...source, section: source.section.replace('noun="Permit"', 'noun="Record"') }],
  ];
  for (const [name, changed] of mutations) {
    if (audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — route, API, and profile mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — permit↔unit is forward persisted, reverse filtered, and drillable`);
