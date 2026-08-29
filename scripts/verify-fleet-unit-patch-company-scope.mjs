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
  const patchStart = s.backend.indexOf('app.patch(\n    "/api/v1/mdata/units/:id"');
  const patchEnd = s.backend.indexOf('"/api/v1/mdata/units/:id/deactivate"', patchStart);
  const patchBackend = patchStart >= 0 && patchEnd > patchStart ? s.backend.slice(patchStart, patchEnd) : "";
  const apiStart = s.api.indexOf("export function patchUnit(");
  const apiEnd = s.api.indexOf("\n}\n", apiStart);
  const patchUnitSource = apiStart >= 0 && apiEnd > apiStart ? s.api.slice(apiStart, apiEnd + 2) : "";
  if (!/patchUnit\(id: string, operatingCompanyId: string/.test(patchUnitSource) || !/operating_company_id: operatingCompanyId/.test(patchUnitSource)) failures.push("shared unit PATCH must carry selected company");
  if (!/patchUnit\(input\.unitId, input\.companyId, input\.patch\)/.test(s.edit)) failures.push("Edit Vehicle submitted save must carry selected company");
  if (!/patchUnit\(row\.id, input\.companyId, \{ deactivated_at: null \}\)/.test(s.table)) failures.push("roster reactivation must carry submitted company");
  if (!/patchUnit\(unitId, companyId, \{ status: "InService" \}\)/.test(s.header) || !/companyId=\{companyId\}/.test(s.header)) failures.push("identity status actions must carry selected company");
  if (!/patchUnit\(unitId, companyId, body\)/.test(s.status)) failures.push("status modal save must carry selected company");
  if (!/patchUnit\(input\.unitId, input\.companyId, input\.patch\)/.test(s.profile) || !/saveMutation\.mutate\(\{[\s\S]*?unitId: id,[\s\S]*?companyId,[\s\S]*?generation: actionGenerationRef\.current/.test(s.profile)) failures.push("profile save must snapshot selected unit/company/generation");
  if (!/resolveOperatingCompanyId\([\s\S]{0,180}req\.query/.test(s.backend) || !/owner_company_id = \$\$\{scopeIdx\} OR currently_leased_to_company_id = \$\$\{scopeIdx\}/.test(s.backend)) failures.push("backend PATCH must resolve and enforce requested company");
  if (!/unit_patch_dca[\s\S]*company_id = \$2::uuid[\s\S]*is_authorized = true[\s\S]*deactivated_at IS NULL/.test(patchBackend)) failures.push("backend PATCH must validate selected driver in the operating company");
  if (!/"assigned_driver_id" in normalizedPatch[\s\S]*syncCanonicalDefaultDriver\(client,[\s\S]*unitId: String\(updatedRow\.id\)[\s\S]*operatingCompanyId: scopedCompanyId/.test(patchBackend)) failures.push("backend PATCH must synchronize the canonical default-driver edge");
  if (!/withCurrentUser\(authUser\.uuid, async \(client\) =>[\s\S]*syncCanonicalDefaultDriver[\s\S]*appendCrudAudit/.test(patchBackend)) failures.push("unit PATCH, canonical assignment, and audit must use the wrapper transaction");
  if (/client\.query\(["'`](?:BEGIN|COMMIT|ROLLBACK)["'`]\)/.test(patchBackend)) failures.push("unit PATCH must not own nested transaction control");
  const leaf = JSON.parse(s.matrix).leaves.find((entry) => entry.id === "unit.edit.quick_availability");
  const expected = ["driver", "unit", "picker_law", "connectivity"];
  if (!leaf || JSON.stringify(leaf.required) !== JSON.stringify(expected)) failures.push("quick availability applicability must not invent load or inline reverse ownership");
  if (!/assigned_driver_id[\s\S]{0,120}type: "driver"[\s\S]{0,80}Quick-availability/.test(s.edit) || !/<EntityPicker[\s\S]{0,100}kind="driver"/.test(s.edit)) failures.push("quick availability must retain canonical driver picker/FK");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["api scope", "api", /export function patchUnit\(id: string, operatingCompanyId: string, body: Record<string, unknown>\) \{\n  const qs = new URLSearchParams\(\{ operating_company_id: operatingCompanyId \}\);/, "export function patchUnit(id: string, operatingCompanyId: string, body: Record<string, unknown>) {\n  const qs = new URLSearchParams({ wrong_company: operatingCompanyId });"],
    ["edit scope", "edit", /patchUnit\(input\.unitId, input\.companyId, input\.patch\)/, "patchUnit(input.unitId, input.patch)"],
    ["roster scope", "table", /patchUnit\(row\.id, input\.companyId, \{ deactivated_at: null \}\)/, "patchUnit(row.id, operatingCompanyId, { deactivated_at: null })"],
    ["header scope", "header", /patchUnit\(unitId, companyId, \{ status: "InService" \}\)/, 'patchUnit(unitId, { status: "InService" })'],
    ["status scope", "status", /patchUnit\(unitId, companyId, body\)/, "patchUnit(unitId, body)"],
    ["profile scope", "profile", /patchUnit\(input\.unitId, input\.companyId, input\.patch\)/, "patchUnit(input.unitId, companyId, input.patch)"],
    ["backend scope", "backend", /owner_company_id = \$\$\{scopeIdx\}/, "owner_company_id = owner_company_id"],
    ["driver company", "backend", /unit_patch_dca\.is_authorized = true/, "TRUE"],
    ["canonical edge", "backend", /(\"assigned_driver_id\" in normalizedPatch[\s\S]{0,120})syncCanonicalDefaultDriver\(client, \{/, "$1Promise.resolve({"],
    ["patch transaction", "backend", /const updated = await withCurrentUser/, "const updated = await noTransaction"],
    ["nested transaction", "backend", /const updated = await withCurrentUser/, 'const updated = await withCurrentUser\n          await client.query("BEGIN");'],
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
