#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-maintenance-inspection-unit-linkage";
const files = {
  route: "apps/backend/src/maintenance/inspections.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  page: "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx",
  reverse: "apps/frontend/src/components/maintenance/UnitMaintenanceInspectionsReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  detail: "apps/frontend/src/pages/units/UnitDetail.tsx",
  link: "apps/frontend/src/components/shared/EntityLink.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/EntityPicker[\s\S]{0,100}kind="unit"/.test(s.page) || !/unit_id:\s*draft\.unit_id,\s*\n\s*inspection_type:/.test(s.page)) failures.push("creator must pick and submit canonical unit_id");
  if (!/AS unit_ok/.test(s.route) || !/AS dvir_ok/.test(s.route)) failures.push("writer must validate unit scope and same-unit DVIR");
  if (!/COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$1::uuid/.test(s.route)) failures.push("unit validator must use the canonical owner/lease scope expression");
  if (!/ds\.unit_id = \$2::uuid/.test(s.route) || (s.route.match(/validateInspectionLinks\(client/g) ?? []).length < 2 || !/linked_entity_not_in_operating_company/.test(s.route)) failures.push("DVIR must belong to the selected unit and invalid links must fail before write");
  if (!/listMaintenanceInspections[\s\S]{0,500}params\.unit_id\) q\.set\("unit_id", params\.unit_id\)/.test(s.api)) failures.push("client must forward unit reverse filter");
  if (!/listMaintenanceInspections\(operatingCompanyId, \{ unit_id: unitId \}\)/.test(s.reverse) || !/ListErrorBanner/.test(s.reverse)) failures.push("reverse section must read exact unit filter and expose errors");
  if (!/<UnitMaintenanceInspectionsReverseSection[^>]+unitId=\{id\}/.test(s.profile)) failures.push("vehicle profile must mount unit inspection reverse");
  if (!/<UnitMaintenanceInspectionsReverseSection[^>]+unitId=\{id\}/.test(s.detail)) failures.push("secondary unit detail route must mount unit inspection reverse");
  if (!/case "maintenance_inspection":[\s\S]{0,100}inspections\?inspection_id=/.test(s.link)) failures.push("inspection must drill to canonical highlighted list");
  if (!/deepLinkInspectionId === String\(row\.id\)/.test(s.page)) failures.push("inspection list must highlight deep-linked row");
  if (!/EntityLinkOrTombstone kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number\} noun="Unit"/.test(s.page)) failures.push("inspection unit identity must use the unresolved-safe canonical drill");
  if (!/<EntityLinkOrTombstone[\s\S]{0,80}kind="dvir"[\s\S]{0,80}id=\{row\.dvir_submission_id\}[\s\S]{0,240}noun="DVIR"/.test(s.page)) failures.push("nullable DVIR identity must use the unresolved-safe canonical drill");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "page", /(<EntityPicker\s*\n\s*)kind="unit"/, '$1kind="driver"'], ["payload", "page", /unit_id:\s*draft\.unit_id,\s*\n\s*inspection_type:/, "unit_id: undefined,\n    inspection_type:"],
    ["unit validation", "route", /AS unit_ok/, "AS asset_ok"], ["dvir validation", "route", /AS dvir_ok/, "AS form_ok"],
    ["lease scope", "route", /COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$1::uuid/, "u.owner_company_id = $1::uuid"],
    ["same unit", "route", /ds\.unit_id = \$2::uuid/, "TRUE"], ["reject", "route", /validateInspectionLinks\(client/, "Promise.resolve(true"],
    ["api", "api", /(listMaintenanceInspections[\s\S]{0,500})q\.set\("unit_id", params\.unit_id\)/, '$1q.set("status", params.unit_id)'],
    ["reverse", "reverse", /listMaintenanceInspections\(operatingCompanyId, \{ unit_id: unitId \}\)/, "listMaintenanceInspections(operatingCompanyId)"],
    ["profile", "profile", /UnitMaintenanceInspectionsReverseSection/g, "MissingInspectionSection"],
    ["detail", "detail", /UnitMaintenanceInspectionsReverseSection/g, "MissingInspectionSection"],
    ["drill", "link", /case "maintenance_inspection":/, 'case "inspection_missing":'],
    ["highlight", "page", /deepLinkInspectionId === String\(row\.id\)/, "false"],
    ["unit tombstone", "page", /EntityLinkOrTombstone kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number\} noun="Unit"/, 'EntityLink kind="unit" id={row.unit_id} label={row.unit_number}'],
    ["DVIR tombstone", "page", /(<EntityLinkOrTombstone\s*\n\s*)kind="dvir"/, '$1kind="load"'],
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
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — inspection unit/DVIR writer validation→two unit reverse mounts→canonical drill`);
