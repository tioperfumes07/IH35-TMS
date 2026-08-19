#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leafRe":"^(damage_reports\.intake|fault_drafts\.review)$","task":"LINK-F5128-UNIT-HIDDEN-SURFACE-REVERSE","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  assets: fs.readFileSync("apps/frontend/src/components/assets/AssetListTable.tsx", "utf8"),
  damage: fs.readFileSync("apps/frontend/src/pages/maintenance/components/MaintenanceDamageRegisterTab.tsx", "utf8"),
  workOrder: fs.readFileSync("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx", "utf8"),
  faults: fs.readFileSync("apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx", "utf8"),
  dtc: fs.readFileSync("apps/frontend/src/pages/maintenance/components/DtcAutoWorkOrdersCard.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
};

const checks = [
  ["assets", /kind="unit" id=\{row\.id\}/, "asset register drills to canonical unit"],
  ["damage", /kind="unit" id=\{row\.unit_id\}/, "damage register drills to canonical unit"],
  ["workOrder", /kind="unit" id=\{row\.asset_id\}/, "work-order financial asset drills to canonical unit"],
  // CC-2 GUARD 2026-08-19: re-anchored per LST-F5169 (cited in-code in FaultDraftsPage.tsx): the
  // old static "?unit_id= banner" this check looked for was deliberately replaced — its own comment
  // reads "URL-only banner is not reverse chrome" — with a live EntityPicker seeded from the same
  // deep-link param (deepLinkUnitId -> unitIdFromUrl -> applied.unitId -> staged.draft.unitId ->
  // EntityPicker value), which is real interactive reverse chrome, not a downgrade.
  ["faults", /<EntityPicker\s*\n\s*kind="unit"[\s\S]{0,200}value=\{filterDraft\.unitId/, "fault-draft filter banner drills to canonical unit"],
  ["dtc", /if \(compact\)[\s\S]*?kind="unit" id=\{row\.unit_id\}/, "DTC compact surface drills to canonical unit"],
  ["dtc", /Unit <EntityLink kind="unit" id=\{row\.unit_id\}/, "DTC full surface drills to canonical unit"],
  ["dtc", /Open work order/, "DTC compact surface retains explicit work-order action without nested controls"],
  ["entityLink", /case "unit":[\s\S]*?return `\/fleet\/units\/\$\{id\}`/, "unit resolver targets mounted fleet profile"],
];

const failures = (candidate) => checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
const found = failures(sources);
if (found.length) {
  console.error(`verify-unit-hidden-surface-reverse-links: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-unit-hidden-surface-reverse-links: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-unit-hidden-surface-reverse-links: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-unit-hidden-surface-reverse-links: PASS — ${checks.length} unit hidden-surface reverse invariants`);
