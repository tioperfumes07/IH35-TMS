#!/usr/bin/env node
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
  editVehicle: "apps/frontend/src/components/fleet/EditVehicleModal.tsx",
  quickAssign: "apps/frontend/src/components/fleet/QuickAssignModal.tsx",
};
const LABEL = "verify-fleet-unit-roster-modals";

export function audit(src) {
  const failures = [];
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
  if (!/function fleetProfilePath\(row: FleetRow\): string \{/.test(src.table)) {
    failures.push(`${FILES.table}: home.roster rows must link to the real unit's own profile path`);
  }
  if (!/open=\{editingUnitId !== null && editingRow\?\.kind !== "trailer"\}/.test(src.table)) {
    failures.push(`${FILES.table}: roster.row.edit_unit must open the real unit edit modal for truck rows`);
  }
  if (!/return createUnit\(\{/.test(src.createUnit)) {
    failures.push(`${FILES.createUnit}: fleet.modal.create_unit must call the canonical createUnit`);
  }
  if (!/patchUnit\(unitId!, operatingCompanyId, patchPayload\)/.test(src.editVehicle)) {
    failures.push(`${FILES.editVehicle}: fleet.modal.edit_vehicle must patch the real edited unit in the selected company`);
  }
  if (!/equipmentKind: "truck" \| "trailer"/.test(src.quickAssign)) {
    failures.push(`${FILES.quickAssign}: fleet.modal.quick_assign must genuinely support truck (unit) targets`);
  }
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
    ["profile-path-fn", "table", /function fleetProfilePath\(row: FleetRow\): string \{/, "function fleetProfilePathUnused(row: FleetRow): string {"],
    ["edit-unit-branch", "table", /open=\{editingUnitId !== null && editingRow\?\.kind !== "trailer"\}/, "open={false}"],
    ["create-unit-call", "createUnit", /return createUnit\(\{/, "return createSomethingElse({"],
    ["edit-vehicle-patch", "editVehicle", /patchUnit\(unitId!, operatingCompanyId, patchPayload\)/, "patchUnit(unitId!, patchPayload)"],
    ["quick-assign-kind", "quickAssign", /equipmentKind: "truck" \| "trailer"/, 'equipmentKind: "trailer"'],
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
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fleet roster/bulk/modals genuinely kind-branch unit (truck) rows`);
