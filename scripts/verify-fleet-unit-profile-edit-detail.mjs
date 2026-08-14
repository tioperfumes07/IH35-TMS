#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^unit\\.profile\\.(identity|telemetry|driver_assign|quick_assign|current_load|trip_cost|maintenance|compliance|expenses_reverse|insurance_summary|reefer|financial_pl|documents|legal_reverse|insurance_claims_reverse|safety_reverse|bank_txns|audit_history|qbo_mapping|action_bar)$","task":"LINK-F5167-FLEET-UNIT-PROFILE"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^unit\\.edit\\.(identity|insurance|irp_plates|reefer|financial|lifecycle|quick_availability|documents)$","task":"LINK-F5167-FLEET-UNIT-EDIT"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^unit\\.detail\\.(permits|toll_tags|tasks|brakes|tires|finance_linkage)$","task":"LINK-F5167-FLEET-UNIT-DETAIL"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^trailer\\.profile\\.assignment$","task":"LINK-F5167-FLEET-TRAILER-ASSIGNMENT-UNIT"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): VehicleProfilePage.tsx's 20
 * unit.profile.* sections and EditVehicleModal.tsx's 8 unit.edit.* tabs are all genuinely
 * self-referential to THIS unit (fetchUnitProfile(id,...)/patchUnit(id/unitId,...) — the page's own
 * :id route param). UnitDetail.tsx's 6 unit.detail.* tabs are the same self-referential pattern.
 * trailer.profile.assignment genuinely shows the real attached truck's unit_id via EntityLink.
 *
 * Self-test: node scripts/verify-fleet-unit-profile-edit-detail.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  editModal: "apps/frontend/src/components/fleet/EditVehicleModal.tsx",
  unitDetail: "apps/frontend/src/pages/units/UnitDetail.tsx",
  assignment: "apps/frontend/src/components/trailer-profile/CurrentAssignmentSection.tsx",
};
const LABEL = "verify-fleet-unit-profile-edit-detail";

export function audit(src) {
  const failures = [];
  if (!/fetchUnitProfile\(id, companyId\)/.test(src.profile)) {
    failures.push(`${FILES.profile}: unit.profile.* sections must all be fed by a real fetchUnitProfile(id, ...) query`);
  }
  if (!/patchUnit\(id, \{/.test(src.profile)) {
    failures.push(`${FILES.profile}: profile-level unit edits (e.g. QBO mapping) must patch the real unit id`);
  }
  if ((src.profile.match(/unitId=\{id\}/g) || []).length < 10) {
    failures.push(`${FILES.profile}: unit.profile.* reverse-drill sections must be self-referentially scoped via unitId={id}`);
  }
  if (!/patchUnit\(unitId!, patchPayload\)/.test(src.editModal)) {
    failures.push(`${FILES.editModal}: unit.edit.* tabs must all patch the real edited unit's own id`);
  }
  if (!/<UnitPermitsTab unitId=\{id\}/.test(src.unitDetail) || !/<UnitFinanceLinkageTab unitId=\{id\}/.test(src.unitDetail)) {
    failures.push(`${FILES.unitDetail}: unit.detail.* tabs must be self-referentially scoped via unitId={id}`);
  }
  if (!/targetType="unit" targetId=\{id\}/.test(src.unitDetail)) {
    failures.push(`${FILES.unitDetail}: unit.detail.tasks must scope TasksTab to targetType="unit" targetId={id}`);
  }
  if (!/unit\?\.unit_id \?[\s\S]{0,100}id=\{String\(unit\.unit_id\)\}/.test(src.assignment)) {
    failures.push(`${FILES.assignment}: trailer.profile.assignment must render a real EntityLink to the attached unit`);
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
    ["profile-query", "profile", /fetchUnitProfile\(id, companyId\)/g, "fetchSomethingElse(id, companyId)"],
    ["profile-patch", "profile", /patchUnit\(id, \{/, "patchSomethingElse(id, {"],
    ["profile-scoping", "profile", /unitId=\{id\}/g, "unitId={undefined}"],
    ["edit-modal-patch", "editModal", /patchUnit\(unitId!, patchPayload\)/, "patchUnit(undefined, patchPayload)"],
    ["unit-detail-permits", "unitDetail", /<UnitPermitsTab unitId=\{id\}/, "<UnitPermitsTab unitId={undefined}"],
    ["unit-detail-tasks", "unitDetail", /targetType="unit" targetId=\{id\}/, 'targetType="load" targetId={id}'],
    ["assignment-link", "assignment", /unit\?\.unit_id \?[\s\S]{0,100}id=\{String\(unit\.unit_id\)\}/, 'kind="trailer" id={unit.trailer_id}'],
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
console.log(`${LABEL} PASS — fleet unit profile/edit/detail surfaces are genuinely self-referential`);
