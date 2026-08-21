#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["driver","unit","connectivity"],"leafRe":"^unit\\.edit\\.quick_availability$","task":"FLEET-UNIT-PATCH-COMPANY-SCOPE"} */
import fs from "node:fs";

const LABEL = "verify-fleet-unit-patch-company-scope";
const FILES = {
  api: "apps/frontend/src/api/mdata.ts",
  edit: "apps/frontend/src/components/fleet/EditVehicleModal.tsx",
  table: "apps/frontend/src/components/FleetTable.tsx",
  header: "apps/frontend/src/components/vehicle-profile/IdentityStatusHeader.tsx",
  status: "apps/frontend/src/components/vehicle-profile/StatusChangeModal.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  backend: "apps/backend/src/mdata/units.routes.ts",
  matrix: "docs/specs/scoreboard/modules/fleet.required.json",
};
const source = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  const apiStart = s.api.indexOf("export function patchUnit(");
  const apiEnd = s.api.indexOf("\n}\n", apiStart);
  const patchUnitSource = apiStart >= 0 && apiEnd > apiStart ? s.api.slice(apiStart, apiEnd + 2) : "";
  if (!/patchUnit\(id: string, operatingCompanyId: string/.test(patchUnitSource) || !/operating_company_id: operatingCompanyId/.test(patchUnitSource)) failures.push("shared unit PATCH must carry selected company");
  if (!/patchUnit\(unitId!, operatingCompanyId, patchPayload\)/.test(s.edit)) failures.push("Edit Vehicle save must carry selected company");
  if (!/patchUnit\(row\.id, operatingCompanyId, \{ deactivated_at: null \}\)/.test(s.table)) failures.push("roster reactivation must carry selected company");
  if (!/patchUnit\(unitId, companyId, \{ status: "InService" \}\)/.test(s.header) || !/companyId=\{companyId\}/.test(s.header)) failures.push("identity status actions must carry selected company");
  if (!/patchUnit\(unitId, companyId, body\)/.test(s.status)) failures.push("status modal save must carry selected company");
  if (!/patchUnit\(id, companyId, \{/.test(s.profile)) failures.push("profile save must carry selected company");
  if (!/resolveOperatingCompanyId\([\s\S]{0,180}req\.query/.test(s.backend) || !/owner_company_id = \$\$\{scopeIdx\} OR currently_leased_to_company_id = \$\$\{scopeIdx\}/.test(s.backend)) failures.push("backend PATCH must resolve and enforce requested company");
  const leaf = JSON.parse(s.matrix).leaves.find((entry) => entry.id === "unit.edit.quick_availability");
  const expected = ["driver", "unit", "picker_law", "connectivity"];
  if (!leaf || JSON.stringify(leaf.required) !== JSON.stringify(expected)) failures.push("quick availability applicability must not invent load or inline reverse ownership");
  if (!/assigned_driver_id[\s\S]{0,120}type: "driver"[\s\S]{0,80}Quick-availability/.test(s.edit) || !/<EntityPicker[\s\S]{0,100}kind="driver"/.test(s.edit)) failures.push("quick availability must retain canonical driver picker/FK");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["api scope", "api", /export function patchUnit\(id: string, operatingCompanyId: string, body: Record<string, unknown>\) \{\n  const qs = new URLSearchParams\(\{ operating_company_id: operatingCompanyId \}\);/, "export function patchUnit(id: string, operatingCompanyId: string, body: Record<string, unknown>) {\n  const qs = new URLSearchParams({ wrong_company: operatingCompanyId });"],
    ["edit scope", "edit", /patchUnit\(unitId!, operatingCompanyId, patchPayload\)/, "patchUnit(unitId!, patchPayload)"],
    ["roster scope", "table", /patchUnit\(row\.id, operatingCompanyId, \{ deactivated_at: null \}\)/, "patchUnit(row.id, { deactivated_at: null })"],
    ["header scope", "header", /patchUnit\(unitId, companyId, \{ status: "InService" \}\)/, 'patchUnit(unitId, { status: "InService" })'],
    ["status scope", "status", /patchUnit\(unitId, companyId, body\)/, "patchUnit(unitId, body)"],
    ["profile scope", "profile", /patchUnit\(id, companyId, \{/, "patchUnit(id, {"],
    ["backend scope", "backend", /owner_company_id = \$\$\{scopeIdx\}/, "owner_company_id = owner_company_id"],
    ["false load", "matrix", /"picker_law",\n        "connectivity"/, '"load",\n        "picker_law",\n        "connectivity"'],
    ["driver picker", "edit", /kind="driver"/, 'kind="unit"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (mutated[key] === source[key] || !audit(mutated).length) throw new Error(`${LABEL} SELFTEST FAIL — ${name}`);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — every unit PATCH carries selected company; quick availability owns driver/unit without invented load/reverse`);
