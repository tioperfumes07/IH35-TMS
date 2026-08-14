#!/usr/bin/env node
/** @matrix-built modules=dispatch cols=unit,connectivity,reverse_link,picker_law leafRe=^(dispatch\.wizard\.border_crossing_wizard_page|queues\.border_history)$ task=BORDER-CROSSING-UNIT-LINKAGE */
// LINK-THEATER-01 narrowing (2026-08-14): sibling of LINK-F5148 — unit side. Real, tracked leaves:
// dispatch.wizard.border_crossing_wizard_page (unit picker on the create wizard) and
// queues.border_history. "compliance" dropped — unjustified, zero compliance file read. "fleet"
// ALSO dropped, not silently kept: UnitBorderCrossingsReverseSection is genuinely mounted on
// VehicleProfilePage.tsx (fleet/units/:id), but that mount has NO tracked leaf id in
// fleet.required.json — every unit.profile.*_reverse id is enumerated there except this one. Real,
// open inventory gap (third one surfaced this pass, after LINK-F5145/F5146's DriverDetail.tsx gap) —
// not invented a leaf id to close it artificially.
import fs from "node:fs";
const LABEL = "verify-border-crossing-unit-linkage";
const files = {
  wizard: "apps/frontend/src/components/border-crossing/WizardStep1.tsx",
  submit: "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx",
  writer: "apps/backend/src/border-crossing/border-crossing-wizard.routes.ts",
  historyRoute: "apps/backend/src/border-crossing/border-crossing-history.routes.ts",
  history: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx",
  reverse: "apps/frontend/src/components/dispatch/UnitBorderCrossingsReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
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
  if (!/border-crossing\/history\?crossing_id=/.test(s.reverse) || !/row\.id === deepLinkCrossingId/.test(s.history)) failures.push("reverse drill must select canonical history row");
  if (!/UnitBorderCrossingsReverseSection[\s\S]{0,160}unitId=\{id\}/.test(s.profile)) failures.push("unit profile border reverse mount missing");
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
    ["drill", "reverse", /history\?crossing_id=/, "history?unit_id="],
    ["mount", "profile", /UnitBorderCrossingsReverseSection/g, "MissingBorderReverse"],
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
