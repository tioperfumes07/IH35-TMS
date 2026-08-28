#!/usr/bin/env node
/** @matrix-built {"modules":["safety","drivers"],"cols":["driver","connectivity","reverse_link","picker_law"],"leafRe":"^safety\\.panel\\.test_scheduling$|^drug_alcohol\\.list$|^profiles\\.detail$","task":"THEATER-DA-TEST-DRIVER-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-da-test-driver-linkage";
const files = {
  creator: "apps/frontend/src/pages/safety/drug-alcohol/TestSchedulingPanel.tsx",
  route: "apps/backend/src/safety/drug-alcohol/routes.ts",
  service: "apps/backend/src/safety/drug-alcohol/program.service.ts",
  api: "apps/frontend/src/api/safety.ts",
  reverse: "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  const scheduleStart = s.service.indexOf("export async function scheduleTest(");
  const scheduleEnd = s.service.indexOf("export async function listTestRecords(", scheduleStart);
  const scheduleReader = scheduleStart >= 0 && scheduleEnd > scheduleStart ? s.service.slice(scheduleStart, scheduleEnd) : "";
  const enrollmentStart = s.service.indexOf("export async function listEnrollments(");
  const enrollmentEnd = s.service.indexOf("export async function deactivateEnrollment(", enrollmentStart);
  const enrollmentReader = enrollmentStart >= 0 && enrollmentEnd > enrollmentStart ? s.service.slice(enrollmentStart, enrollmentEnd) : "";
  const testsStart = s.service.indexOf("export async function listTestRecords(");
  const testsEnd = s.service.indexOf("export async function recordResult(", testsStart);
  const testReader = testsStart >= 0 && testsEnd > testsStart ? s.service.slice(testsStart, testsEnd) : "";
  if (!/kind="driver"[\s\S]{0,180}value=\{driverUuid \|\| null\}/.test(s.creator) || !/driver_uuid:\s*driverUuid/.test(s.creator)) failures.push("canonical driver picker-to-payload path missing");
  if (!/const scheduleTestSchema = z\.object\(\{[\s\S]{0,160}driver_uuid:\s*z\.string\(\)\.uuid\(\)/.test(s.route) || !/scheduleTest\([\s\S]{0,220}parsed\.data\.driver_uuid/.test(s.route)) failures.push("route must validate and forward driver UUID");
  if (!["FROM mdata.drivers d", "d.operating_company_id = $1::uuid", "d.status = 'Active'", "d.deactivated_at IS NULL", "d.archived_at IS NULL"].every((token) => scheduleReader.includes(token))) failures.push("writer active tenant driver validation missing");
  if (!["FROM mdata.driver_company_authorizations da_enrollment_label_dca", "da_enrollment_label_dca.driver_id = d.id", "da_enrollment_label_dca.company_id::text = e.operating_company_id", "da_enrollment_label_dca.is_authorized = true", "da_enrollment_label_dca.deactivated_at IS NULL"].every((token) => enrollmentReader.includes(token))) failures.push("enrollment GET must resolve authorized shared-driver labels");
  if (!["FROM mdata.driver_company_authorizations da_test_label_dca", "da_test_label_dca.driver_id = d.id", "da_test_label_dca.company_id::text = t.operating_company_id", "da_test_label_dca.is_authorized = true", "da_test_label_dca.deactivated_at IS NULL"].every((token) => testReader.includes(token))) failures.push("test-history GET must resolve authorized shared-driver labels");
  if (!/active_driver_not_in_operating_company/.test(s.service)) failures.push("writer must reject invalid driver explicitly");
  if (!/driver_uuid:\s*driverUuid/.test(s.api) || !/\/api\/safety\/drug-alcohol\/tests/.test(s.api)) failures.push("exact driver reverse API missing");
  if (!/getDriverDrugAlcoholTests\(operatingCompanyId, driverId\)/.test(s.reverse) || !/Failed to load this driver's drug & alcohol tests/.test(s.reverse) || !/No drug or alcohol tests recorded for this driver/.test(s.reverse)) failures.push("honest driver reverse missing");
  if (!/DriverSafetyReverseSection[\s\S]{0,160}driverId=\{id\}/.test(s.profile)) failures.push("driver profile reverse mount missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /kind="driver"([\s\S]{0,180}value=\{driverUuid \|\| null\})/, 'kind="unit"$1'],
    ["payload", "creator", /driver_uuid:\s*driverUuid/, "driver_uuid: ''"],
    ["route", "route", /(const scheduleTestSchema = z\.object\(\{[\s\S]{0,120})driver_uuid:\s*z\.string\(\)\.uuid\(\)/, "$1driver_uuid: z.string()"],
    ["scope", "service", /(export async function scheduleTest\([\s\S]*?)d\.operating_company_id = \$1::uuid/, "$1TRUE"],
    ["active", "service", /(export async function scheduleTest\([\s\S]*?)d\.status = 'Active'/, "$1TRUE"],
    ["deactivated", "service", /(export async function scheduleTest\([\s\S]*?)d\.deactivated_at IS NULL/, "$1TRUE"],
    ["archived", "service", /(export async function scheduleTest\([\s\S]*?)d\.archived_at IS NULL/, "$1TRUE"],
    ["enrollment label company", "service", /da_enrollment_label_dca\.company_id::text = e\.operating_company_id/, "da_enrollment_label_dca.company_id::text = d.operating_company_id::text"],
    ["enrollment label lifecycle", "service", /da_enrollment_label_dca\.deactivated_at IS NULL/, "da_enrollment_label_dca.deactivated_at IS NOT NULL"],
    ["test label active", "service", /da_test_label_dca\.is_authorized = true/, "da_test_label_dca.is_authorized = false"],
    ["test label lifecycle", "service", /da_test_label_dca\.deactivated_at IS NULL/, "da_test_label_dca.deactivated_at IS NOT NULL"],
    ["reverse", "reverse", /getDriverDrugAlcoholTests\(operatingCompanyId, driverId\)/, "getDriverDrugAlcoholTests(operatingCompanyId, operatingCompanyId)"],
    ["mount", "profile", /DriverSafetyReverseSection/g, "MissingSafetyReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — driver picker→active tenant writer→exact driver profile reverse`);
