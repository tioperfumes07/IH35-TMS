#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["home.roster","home.create_unit","home.create_trailer","roster.bulk.status","roster.bulk.type","roster.bulk.inactivate","roster.row.edit_unit","roster.row.edit_trailer"],"task":"FLEET-F5882-ROSTER-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["home.roster","home.create_unit","home.create_trailer","roster.bulk.status","roster.bulk.type","roster.bulk.inactivate","roster.row.edit_unit","roster.row.edit_trailer"],"task":"FLEET-F5931-ROSTER-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^(home\\.roster|home\\.create_unit|roster\\.kind\\.(all|trucks)|roster\\.filter\\.(type|status_active|status_inshop|status_oos)|roster\\.bulk\\.(status|type|inactivate)|roster\\.row\\.edit_unit)$","task":"LINK-F5167-FLEET-ROSTER-UNIT"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^fleet\\.modal\\.(edit_vehicle|create_unit|quick_assign)$","task":"LINK-F5167-FLEET-UNIT-MODALS"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): the fleet roster genuinely
 * kind-branches truck (unit) rows — a real kindFilter, real status filter applying uniformly, real
 * bulk truck mutation, and real per-row navigation to the unit's own profile. Create/edit modals
 * genuinely create/patch real mdata.units rows.
 *
 * Self-test: node scripts/verify-fleet-unit-roster-modals.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  tablePage: "apps/frontend/src/pages/maintenance/FleetTablePage.tsx",
  table: "apps/frontend/src/components/FleetTable.tsx",
  createUnit: "apps/frontend/src/components/fleet/CreateUnitModal.tsx",
  createTrailer: "apps/frontend/src/components/fleet/CreateTrailerModal.tsx",
  editTrailer: "apps/frontend/src/components/fleet/EditTrailerModal.tsx",
  editVehicle: "apps/frontend/src/components/fleet/EditVehicleModal.tsx",
  quickAssign: "apps/frontend/src/components/fleet/QuickAssignModal.tsx",
  quickAssignRoute: "apps/backend/src/assignments/quicksave.routes.ts",
  assignmentSchema: "db/migrations/0221_cap9_vehicle_driver_assignments.sql",
  required: "docs/specs/scoreboard/modules/fleet.required.json",
  self: "scripts/verify-fleet-unit-roster-modals.mjs",
};
const LABEL = "verify-fleet-unit-roster-modals";
const REVERSE_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["home.roster","home.create_unit","home.create_trailer","roster.bulk.status","roster.bulk.type","roster.bulk.inactivate","roster.row.edit_unit","roster.row.edit_trailer"],"task":"FLEET-F5882-ROSTER-REVERSE-EXACT","vertical":"class-sweep"} */';
const CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["home.roster","home.create_unit","home.create_trailer","roster.bulk.status","roster.bulk.type","roster.bulk.inactivate","roster.row.edit_unit","roster.row.edit_trailer"],"task":"FLEET-F5931-ROSTER-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const REVERSE_LEAVES = [
  "home.roster",
  "home.create_unit",
  "home.create_trailer",
  "roster.bulk.status",
  "roster.bulk.type",
  "roster.bulk.inactivate",
  "roster.row.edit_unit",
  "roster.row.edit_trailer",
];

export function audit(src) {
  const failures = [];
  const required = JSON.parse(src.required);
  const reverseAudit = required.honesty_audit?.reverse_link_column_2026_08_14;
  const nonEntityReverseIds = [
    "roster.kind.all",
    "roster.kind.trucks",
    "roster.kind.trailers",
    "roster.filter.type",
    "roster.filter.status_active",
    "roster.filter.status_inshop",
    "roster.filter.status_oos",
    "unit.edit.reefer",
  ];
  if (reverseAudit?.leaves_touched !== 33) {
    failures.push(`${FILES.required}: reverse-link audit must enumerate 33 corrected leaves`);
  }
  for (const id of nonEntityReverseIds) {
    const leaf = required.leaves?.find((entry) => entry.id === id);
    if (leaf?.required?.includes("reverse_link")) {
      failures.push(`${FILES.required}: ${id} must not require reverse_link`);
    }
    const drop = reverseAudit?.drops?.find((entry) => entry.id === id);
    if (!drop?.removed?.includes("reverse_link") || !/not an FK-bearing entity/.test(drop?.reason ?? "")) {
      failures.push(`${FILES.required}: ${id} must retain its explicit non-FK reverse_link applicability drop`);
    }
  }
  if (!/const kindFilter = searchParams\.get\("kind"\) \?\? ""/.test(src.tablePage)) {
    failures.push(`${FILES.tablePage}: roster.kind.trucks must filter real rows by a real kindFilter`);
  }
  if (!/if \(kindFilter && r\.kind !== kindFilter\) return false/.test(src.tablePage)) {
    failures.push(`${FILES.tablePage}: kind filter must actually apply to the real row set`);
  }
  if (!/function rowMatchesFleetStatus\(row: UnifiedUnitRow, status: string\): boolean \{/.test(src.tablePage) ||
      !/if \(softDeleteFilter === "active" && effectiveStatus && !rowMatchesFleetStatus\(r, effectiveStatus\)\) return false/.test(src.tablePage)) {
    failures.push(`${FILES.tablePage}: roster.filter.status_* must apply a real status filter to truck rows`);
  }
  if (!/const truckBulkMutation = useMutation\(\{/.test(src.table)) {
    failures.push(`${FILES.table}: roster.bulk.* must have a real truck-scoped bulk mutation`);
  }
  if (!/const trailerBulkMutation = useMutation\(\{/.test(src.table) || !/equipmentIds: trailers\.map\(\(row\) => row\.id\)/.test(src.table)) {
    failures.push(`${FILES.table}: roster.bulk.* must apply to selected trailer ids through the canonical mutation`);
  }
  if (!/if \(patch\.status\) trailerPatch\.status = patch\.status/.test(src.table)) {
    failures.push(`${FILES.table}: roster.bulk.status must forward the selected status to trailer rows`);
  }
  if (!/if \(patch\.equipment_type\)/.test(src.table) || !/else if \(patch\.vehicle_type\)/.test(src.table)) {
    failures.push(`${FILES.table}: roster.bulk.type must normalize unit/trailer type changes`);
  }
  if (!/Promise\.allSettled\([\s\S]{0,500}?`\/api\/v1\/mdata\/\$\{resource\}\/\$\{row\.id\}\/deactivate`[\s\S]{0,80}?method: "POST"/.test(src.table) || /method:\s*["']DELETE["']/.test(src.table)) {
    failures.push(`${FILES.table}: roster.bulk.inactivate must retain rows through canonical soft-deactivate endpoints`);
  }
  if (!/function fleetProfilePath\(row: FleetRow\): string \{/.test(src.table)) {
    failures.push(`${FILES.table}: home.roster rows must link to the real unit's own profile path`);
  }
  if (!/open=\{editingUnitId !== null && editingRow\?\.kind !== "trailer"\}/.test(src.table)) {
    failures.push(`${FILES.table}: roster.row.edit_unit must open the real unit edit modal for truck rows`);
  }
  if (!/return createUnit\(\{/.test(src.createUnit)) {
    failures.push(`${FILES.createUnit}: fleet.modal.create_unit must call the canonical createUnit`);
  }
  if (!/return createEquipment\(\{/.test(src.createTrailer)) {
    failures.push(`${FILES.createTrailer}: home.create_trailer must call canonical createEquipment`);
  }
  if (!/patchUnit\(unitId!, operatingCompanyId, patchPayload\)/.test(src.editVehicle)) {
    failures.push(`${FILES.editVehicle}: fleet.modal.edit_vehicle must patch the real edited unit in the selected company`);
  }
  if (!/open=\{editingUnitId !== null && editingRow\?\.kind === "trailer"\}/.test(src.table)) {
    failures.push(`${FILES.table}: roster.row.edit_trailer must open the real trailer edit modal`);
  }
  if (!/equipmentKind: "truck" \| "trailer"/.test(src.quickAssign)) {
    failures.push(`${FILES.quickAssign}: fleet.modal.quick_assign must genuinely support truck (unit) targets`);
  }
  if (!/VALUES \(\$1, \$2, \$3, now\(\), 'manual_override', true, \$4\)/.test(src.quickAssignRoute)) {
    failures.push(`${FILES.quickAssignRoute}: truck quick-assign must persist the schema-approved manual_override source`);
  }
  if (!/source text NOT NULL CHECK \(source IN \('samsara_webhook', 'manual_override', 'reconciled'\)\)/.test(src.assignmentSchema)) {
    failures.push(`${FILES.assignmentSchema}: assignment source contract changed; reconcile the writer and guard`);
  }
  if (!/setError\(cause instanceof Error \? cause\.message : "Couldn't assign this driver\. Try again\."\)/.test(src.quickAssign)) {
    failures.push(`${FILES.quickAssign}: quick-assign failures must be visible to the operator`);
  }
  const companyEnumLeaves = [
    "home.create_unit",
    "home.create_trailer",
    "fleet.modal.create_unit",
    "fleet.modal.create_trailer",
    "fleet.modal.edit_trailer",
    "unit.edit.identity",
  ];
  const companyEnumAudit = required.honesty_audit?.company_enum_picker_law_2026_08_21;
  if (!companyEnumAudit) {
    failures.push(`${FILES.required}: honesty_audit.company_enum_picker_law_2026_08_21 missing`);
  }
  for (const id of companyEnumLeaves) {
    const leaf = required.leaves?.find((entry) => entry.id === id);
    if (leaf?.required?.includes("picker_law")) {
      failures.push(`${FILES.required}: ${id} must not require picker_law (closed 3-entity company enum, not a create catalog)`);
    }
    const drop = companyEnumAudit?.drops?.find((entry) => entry.id === id);
    if (!drop?.removed?.includes("picker_law")) {
      failures.push(`${FILES.required}: ${id} must keep an explicit picker_law honesty drop`);
    }
  }
  const companyOnlySurfaces = [
    ["createUnit", FILES.createUnit, src.createUnit],
    ["createTrailer", FILES.createTrailer, src.createTrailer],
    ["editTrailer", FILES.editTrailer, src.editTrailer],
  ];
  for (const [, rel, body] of companyOnlySurfaces) {
    if (/EntityPicker|ReferenceSelect|allowCreate\s*=/.test(body)) {
      failures.push(`${rel}: company-enum modal must not mount EntityPicker/ReferenceSelect/allowCreate while picker_law is dropped`);
    }
    if (!/placeholder="Select company"/.test(body)) {
      failures.push(`${rel}: must still expose the closed company Combobox (Select company)`);
    }
  }
  for (const id of REVERSE_LEAVES) {
    const leaf = required.leaves?.find((entry) => entry.id === id);
    if (!leaf?.required?.includes("reverse_link")) {
      failures.push(`${FILES.required}: ${id} must require reverse_link`);
    }
    if (!leaf?.required?.includes("connectivity")) failures.push(`${FILES.required}: ${id} must require connectivity`);
  }
  if (!src.self.split("\n").includes(REVERSE_HEADER)) failures.push(`${FILES.self}: exact roster reverse Built header missing`);
  if (!src.self.split("\n").includes(CONNECTIVITY_HEADER)) failures.push(`${FILES.self}: exact roster connectivity Built header missing`);
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["kind-filter-decl", "tablePage", /const kindFilter = searchParams\.get\("kind"\) \?\? ""/, 'const kindFilter = ""'],
    ["kind-filter-apply", "tablePage", /if \(kindFilter && r\.kind !== kindFilter\) return false/, "if (false) return false"],
    ["status-filter-helper", "tablePage", /function rowMatchesFleetStatus\(row: UnifiedUnitRow, status: string\): boolean \{/, "function removedFleetStatusFilter(row: UnifiedUnitRow, status: string): boolean {"],
    ["status-filter-apply", "tablePage", /if \(softDeleteFilter === "active" && effectiveStatus && !rowMatchesFleetStatus\(r, effectiveStatus\)\) return false/, "if (false) return false"],
    ["bulk-mutation", "table", /const truckBulkMutation = useMutation\(\{/, "const truckBulkMutationUnused = useMutation({"],
    ["trailer-bulk-mutation", "table", /const trailerBulkMutation = useMutation\(\{/, "const trailerBulkMutationUnused = useMutation({"],
    ["bulk-status", "table", /if \(patch\.status\) trailerPatch\.status = patch\.status/, "if (false) trailerPatch.status = patch.status"],
    ["bulk-type", "table", /if \(patch\.equipment_type\)/, "if (false)"],
    ["bulk-inactivate", "table", /`\/api\/v1\/mdata\/\$\{resource\}\/\$\{row\.id\}\/deactivate`/, "`/api/v1/mdata/${resource}/${row.id}/delete`"],
    ["profile-path-fn", "table", /function fleetProfilePath\(row: FleetRow\): string \{/, "function fleetProfilePathUnused(row: FleetRow): string {"],
    ["edit-unit-branch", "table", /open=\{editingUnitId !== null && editingRow\?\.kind !== "trailer"\}/, "open={false}"],
    ["create-unit-call", "createUnit", /return createUnit\(\{/, "return createSomethingElse({"],
    ["create-trailer-call", "createTrailer", /return createEquipment\(\{/, "return createSomethingElse({"],
    ["edit-vehicle-patch", "editVehicle", /patchUnit\(unitId!, operatingCompanyId, patchPayload\)/, "patchUnit(unitId!, patchPayload)"],
    ["edit-trailer-branch", "table", /open=\{editingUnitId !== null && editingRow\?\.kind === "trailer"\}/, "open={false}"],
    ["quick-assign-kind", "quickAssign", /equipmentKind: "truck" \| "trailer"/, 'equipmentKind: "trailer"'],
    ["quick-assign-source", "quickAssignRoute", /'manual_override'/, "'quicksave'"],
    ["quick-assign-source-contract", "assignmentSchema", /'manual_override'/, "'removed_override'"],
    ["quick-assign-visible-error", "quickAssign", /setError\(cause instanceof Error \? cause\.message : "Couldn't assign this driver\. Try again\."\)/, "setError(null)"],
    ["filter-reverse-applicability", "required", /"id": "roster\.filter\.type",\n\s+"removed": \[\n\s+"reverse_link"\n\s+\]/, '"id": "roster.filter.type",\n          "removed": []'],
    ["filter-reverse-count", "required", /"leaves_touched": 33/, '"leaves_touched": 25'],
    ["filter-reverse-reinflation", "required", /("id": "roster\.kind\.trucks"[\s\S]*?"required": \[\n\s+"unit")\n\s+\]/, '$1,\n        "reverse_link"\n      ]'],
    ["reefer-edit-reverse-reinflation", "required", /("id": "unit\.edit\.reefer"[\s\S]*?"required": \[\n\s+"unit",\n\s+"connectivity")\n\s+\]/, '$1,\n        "reverse_link"\n      ]'],
    [
      "company-enum-picker-reinflation",
      "required",
      /("id": "home\.create_unit"[\s\S]*?"required": \[\n\s+"unit",\n\s+"qbo_chrome")/,
      '$1,\n        "picker_law"',
    ],
    [
      "company-enum-honesty-drop-gone",
      "required",
      /"company_enum_picker_law_2026_08_21"/,
      '"company_enum_picker_law_REMOVED"',
    ],
    [
      "create-unit-gains-entity-picker",
      "createUnit",
      /import \{ Combobox \} from "\.\.\/Combobox";/,
      'import { Combobox } from "../Combobox";\nimport { EntityPicker } from "../EntityPicker";',
    ],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  for (const id of REVERSE_LEAVES) {
    const mutated = { ...good, required: good.required.replace(`"id": "${id}"`, `"id": "${id}.broken"`) };
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — Required mutation escaped: ${id}`);
      process.exit(1);
    }
  }
  const wrongHeader = { ...good, self: good.self.replace(REVERSE_HEADER, `${REVERSE_HEADER}.broken`) };
  if (audit(wrongHeader).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — exact reverse header mutation escaped`);
    process.exit(1);
  }
  const wrongConnectivityHeader = { ...good, self: good.self.replace(CONNECTIVITY_HEADER, `${CONNECTIVITY_HEADER}.broken`) };
  if (audit(wrongConnectivityHeader).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — exact connectivity header mutation escaped`);
    process.exit(1);
  }
  for (const id of REVERSE_LEAVES) {
    const marker = `"id": "${id}"`;
    const start = good.required.indexOf(marker);
    const end = good.required.indexOf("\n    },", start);
    const block = good.required.slice(start, end);
    const changed = block.replace(/,?\n\s*"connectivity"/, "");
    const mutated = { ...good, required: `${good.required.slice(0, start)}${changed}${good.required.slice(end)}` };
    if (start < 0 || end < 0 || changed === block || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — Required connectivity mutation escaped: ${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length + (REVERSE_LEAVES.length * 2) + 2} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fleet roster/bulk/modals genuinely kind-branch unit (truck) rows`);
