#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-hos-violation-linkage";
const files = {
  route: "apps/backend/src/routes/safety/hos-violations.ts",
  api: "apps/frontend/src/api/safetyV64.ts",
  tab: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx",
  modal: "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx",
  driver: "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx",
  load: "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx",
  link: "apps/frontend/src/components/shared/EntityLink.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/dot_violation_type_id:\s*z\.string\(\)\.uuid\(\),/.test(s.route)) failures.push("writer contract must require the catalog FK");
  for (const alias of ["driver_ok", "violation_type_ok", "load_ok", "dot_inspection_ok"]) if (!s.route.includes(`AS ${alias}`)) failures.push(`writer must validate ${alias}`);
  if (!/linked_entity_not_in_operating_company/.test(s.route)) failures.push("writer must reject invalid links before insert");
  if (!/filters\.push\(`related_load_id = \$\$\{values\.length\}`\)/.test(s.route)) failures.push("load reverse filter must execute in SQL");
  if (!/filters\.load_id\) qs\.set\("load_id"/.test(s.api)) failures.push("client must forward load reverse filter");
  if (!/disabled=\{!form\.driver_id \|\| !selectedViolationType\?\.id/.test(s.tab) || !/Boolean\(form\.driver_id\.trim\(\) && selectedViolationType\?\.id/.test(s.modal)) failures.push("both creators must wait for a resolved catalog FK");
  if (!/listHosViolations\(operatingCompanyId, \{[\s\S]{0,180}driver_id: driverId[\s\S]{0,180}offset:/.test(s.driver) || !/kind="hos_violation"/.test(s.driver)) failures.push("driver profile must read and drill exact HOS links");
  if (!/openKind="hos_violations_driver"/.test(s.driver) && !/kind="hos_violations_driver"/.test(s.driver)) failures.push("driver profile Open HOS must EntityLink the filtered queue");
  if (!/listHosViolations\(operatingCompanyId, \{[\s\S]{0,180}load_id: loadId[\s\S]{0,180}offset:/.test(s.load) || !/kind="hos_violation"/.test(s.load)) failures.push("load drawer must read and drill exact HOS links");
  if (!/kind="hos_violations_load"/.test(s.load)) failures.push("load drawer Open HOS must EntityLink the filtered queue");
  if (!/case "hos_violation":[\s\S]{0,100}hos-violations\?violation_id=/.test(s.link)) failures.push("HOS EntityLink must target the canonical highlighted list");
  if (!/case "hos_violations_load":[\s\S]{0,80}hos-violations\?load_id=/.test(s.link) || !/case "hos_violations_driver":[\s\S]{0,80}hos-violations\?driver_id=/.test(s.link)) failures.push("HOS Open-queue EntityLinks must resolve filtered list routes");
  if (!/searchParams\.get\("load_id"\)/.test(s.tab) || !/searchParams\.get\("driver_id"\)/.test(s.tab) || !/listHosViolations\(companyId, \{[\s\S]{0,160}load_id: (?:applied\.loadId|loadIdFromUrl)/.test(s.tab)) failures.push("HOS list must honor load_id/driver_id Open-queue URL filters");
  if (!/rowClassName=\{\(row\)[\s\S]{0,180}highlightedViolationId/.test(s.tab)) failures.push("canonical list must highlight violation_id");
  // LST-F5190 — visible list reverse filters
  if (
    !/dataTestId="hos-violations-filter-driver"/.test(s.tab) ||
    !/dataTestId="hos-violations-filter-load"/.test(s.tab) ||
    !/allowCreate=\{false\}/.test(s.tab) ||
    !/setSearchParams/.test(s.tab)
  ) {
    failures.push("HOS list must render EntityPicker driver/load filters synced to URL");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["required catalog", "route", /dot_violation_type_id:\s*z\.string\(\)\.uuid\(\),/, "dot_violation_type_id: z.string().uuid().optional(),"],
    ["driver validation", "route", /AS driver_ok/, "AS driver_missing"],
    ["catalog validation", "route", /AS violation_type_ok/, "AS type_missing"],
    ["load validation", "route", /AS load_ok/, "AS load_missing"],
    ["inspection validation", "route", /AS dot_inspection_ok/, "AS inspection_missing"],
    ["reject", "route", /linked_entity_not_in_operating_company/, "bad_link"],
    ["load SQL", "route", /filters\.push\(`related_load_id = \$\$\{values\.length\}`\)/, "void values"],
    ["api load", "api", /qs\.set\("load_id", filters\.load_id\)/, 'qs.set("driver_id", filters.load_id)'],
    ["tab resolved FK", "tab", /disabled=\{!form\.driver_id \|\| !selectedViolationType\?\.id/, "disabled={!form.driver_id || !form.violation_type"],
    ["modal resolved FK", "modal", /Boolean\(form\.driver_id\.trim\(\) && selectedViolationType\?\.id/, "Boolean(form.driver_id.trim() && form.violation_type"],
    ["driver read", "driver", /listHosViolations\(operatingCompanyId, \{ driver_id: driverId, limit: hosViolationPageSize/, "listHosViolations(operatingCompanyId, { driver_id: '', limit: hosViolationPageSize"],
    ["driver drill", "driver", /kind="hos_violation"/, 'kind="driver"'],
    ["driver open queue", "driver", /openKind="hos_violations_driver"/, 'openKind="hos_violations_missing"'],
    ["load read", "load", /listHosViolations\(operatingCompanyId, \{ load_id: loadId, limit: hosViolationPageSize/, "listHosViolations(operatingCompanyId, { load_id: '', limit: hosViolationPageSize"],
    ["load open queue", "load", /kind="hos_violations_load"/, 'kind="hos_violation"'],
    ["link", "link", /case "hos_violation":/, 'case "hos_missing":'],
    ["open queue kinds", "link", /case "hos_violations_load":/, 'case "hos_violations_gone":'],
    ["url filters", "tab", /load_id: applied\.loadId/g, "load_id: missingLoadFromUrl"],
    ["highlight", "tab", /highlightedViolationId/g, "missingViolationId"],
    ["list filter chrome", "tab", /dataTestId="hos-violations-filter-driver"/g, 'dataTestId="gone"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped or was inert`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} linkage mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — HOS creator→tenant-safe writer→driver/load reverse mounts→canonical drill`);
