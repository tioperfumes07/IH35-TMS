#!/usr/bin/env node
/** @matrix-built modules=dispatch,fleet cols=unit,connectivity,reverse_link,picker_law leafRe=^(dispatch\.wizard\.border_crossing_wizard_page|queues\.border_history|unit\.profile\.border_crossings_reverse)$ task=BORDER-CROSSING-UNIT-LINKAGE */
// LINK-THEATER-01 narrowing (2026-08-14) + inventory close (2026-08-19): real tracked leaves are
// dispatch.wizard.border_crossing_wizard_page, queues.border_history, and
// unit.profile.border_crossings_reverse (UnitBorderCrossingsReverseSection mounted on VehicleProfilePage).
// "compliance" stays dropped — unjustified, zero compliance file read.
import fs from "node:fs";
const LABEL = "verify-border-crossing-unit-linkage";
const files = {
  wizard: "apps/frontend/src/components/border-crossing/WizardStep1.tsx",
  submit: "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx",
  writer: "apps/backend/src/border-crossing/border-crossing-wizard.routes.ts",
  historyRoute: "apps/backend/src/border-crossing/border-crossing-history.routes.ts",
  detectorHistory: "apps/backend/src/integrations/samsara/border-crossings/customs-time.service.ts",
  overview: "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
  history: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx",
  reverse: "apps/frontend/src/components/dispatch/UnitBorderCrossingsReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  fleetRequired: "docs/specs/scoreboard/modules/fleet.required.json",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/<EntityPicker[\s\S]{0,160}kind="unit"/.test(s.wizard)) failures.push("wizard canonical unit picker missing");
  if (!/unit_id:\s*form\.unitId/.test(s.submit)) failures.push("wizard submit must forward unit FK");
  if (!/FROM mdata\.units[\s\S]{0,220}COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL/.test(s.writer)) failures.push("writer active tenant unit validation missing");
  if (!/INSERT INTO mdata\.unit_border_crossings[\s\S]{0,180}operating_company_id, unit_id/.test(s.writer)) failures.push("writer unit persistence missing");
  if (!/unit_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.historyRoute) || !/filters\.push\(`ubc\.unit_id = \$\$\{values\.length\}::uuid`\)/.test(s.historyRoute)) failures.push("exact unit history filter missing");
  if (!/unit_id: unitId/.test(s.reverse) || !/ListErrorBanner/.test(s.reverse)) failures.push("profile reverse must request exact unit and show errors");
  if (!/kind=["']border_crossing["']/.test(s.reverse) || !/row\.id === deepLinkCrossingId/.test(s.history)) failures.push("reverse drill must select canonical history row");
  if (!/UnitBorderCrossingsReverseSection[\s\S]{0,160}unitId=\{id\}/.test(s.profile)) failures.push("unit profile border reverse mount missing");
  if (!/"id"\s*:\s*"unit\.profile\.border_crossings_reverse"/.test(s.fleetRequired)) {
    failures.push("fleet.required.json missing unit.profile.border_crossings_reverse leaf for the mounted reverse section");
  }
  if (!/u\.id::text AS unit_id[\s\S]{0,80}u\.unit_number/.test(s.detectorHistory)
      || !/LEFT JOIN mdata\.units u/.test(s.detectorHistory)
      || !/owner_company_id = e\.operating_company_id/.test(s.detectorHistory)
      || !/currently_leased_to_company_id = e\.operating_company_id/.test(s.detectorHistory)) failures.push("detector history must resolve canonical same-company unit labels");
  // Re-anchored (2026-08-20, CC-3): DispatchOverview now composes this through the governed
  // EntityLinkOrTombstone wrapper (name/noun props) instead of a bare EntityLink around a
  // literal entityLabel() call — same honest UUID-rejection behavior, moved one layer down,
  // same class already fixed for the 11 other siblings this session.
  if (!/event\.unit_id[\s\S]{0,60}<EntityLinkOrTombstone kind="unit" id=\{event\.unit_id\} name=\{event\.unit_number\} noun="Unit"/.test(s.overview)) failures.push("dispatch overview must render the resolved unit label and drill-through");
  if (/entityLabel\(null,\s*event\.vehicle_id,\s*"Record"\)/.test(s.overview)) failures.push("dispatch overview must not turn the raw vehicle id into Record — not visible");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "wizard", /(<EntityPicker[\s\S]{0,160})kind="unit"/, '$1kind="driver"'],
    ["payload", "submit", /unit_id:\s*form\.unitId/, "unit_id: undefined"],
    ["scope", "writer", /COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/, "TRUE"],
    ["active", "writer", /(FROM mdata\.units[\s\S]{0,240})deactivated_at IS NULL/, "$1TRUE"],
    ["filter", "historyRoute", /filters\.push\(`ubc\.unit_id = \$\$\{values\.length\}::uuid`\)/, "filters.push(`TRUE`)"],
    ["reverse", "reverse", /unit_id: unitId/, "unit_id: operatingCompanyId"],
    ["error", "reverse", /ListErrorBanner/g, "MissingErrorBanner"],
    ["drill", "reverse", /kind=["']border_crossing["']/, 'kind="unit"'],
    ["mount", "profile", /UnitBorderCrossingsReverseSection/g, "MissingBorderReverse"],
    ["fleet-leaf", "fleetRequired", /"id"\s*:\s*"unit\.profile\.border_crossings_reverse"/, '"id": "unit.profile.safety_reverse_MISSING"'],
    ["history-label", "detectorHistory", /u\.unit_number/, "NULL::text AS unit_number"],
    ["overview-label", "overview", /<EntityLinkOrTombstone kind="unit" id=\{event\.unit_id\} name=\{event\.unit_number\} noun="Unit" \/>/, 'entityLabel(null, event.vehicle_id, "Record")'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — unit picker→tenant writer→exact history reverse→selected crossing drill`);
