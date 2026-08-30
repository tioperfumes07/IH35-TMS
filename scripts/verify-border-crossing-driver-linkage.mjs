#!/usr/bin/env node
/** @matrix-built modules=dispatch,drivers cols=driver,connectivity,reverse_link,picker_law leafRe=^(dispatch\.wizard\.border_crossing_wizard_page|queues\.border_history|profiles\.detail)$ task=BORDER-CROSSING-DRIVER-LINKAGE */
// LINK-THEATER-01 narrowing (2026-08-14): the prior tag claimed "compliance" as a module and
// leafRe=".*" across dispatch+drivers+compliance — Built for every leaf in three modules. This
// guard's 8 assertions read exactly 7 files, none under compliance: BorderCrossingWizardPage.tsx
// (dispatch.wizard.border_crossing_wizard_page, the create wizard), BorderCrossingHistoryPage.tsx
// (queues.border_history, /dispatch/border-crossing/history), and DriverBorderCrossingsReverseSection
// mounted on DriverProfilePage.tsx (profiles.detail). "compliance" was never justified — zero
// compliance file is read anywhere in this guard.
import fs from "node:fs";
const LABEL = "verify-border-crossing-driver-linkage";
const files = {
  wizard: "apps/frontend/src/components/border-crossing/WizardStep1.tsx",
  submit: "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx",
  writer: "apps/backend/src/border-crossing/border-crossing-wizard.routes.ts",
  historyRoute: "apps/backend/src/border-crossing/border-crossing-history.routes.ts",
  history: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx",
  reverse: "apps/frontend/src/components/dispatch/DriverBorderCrossingsReverseSection.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  const authorizedDriverJoin = (alias) => new RegExp(
    `FROM mdata\\.driver_company_authorizations ${alias}[\\s\\S]{0,180}` +
    `${alias}\\.driver_id = d\\.id[\\s\\S]{0,140}` +
    `${alias}\\.company_id = ubc\\.operating_company_id[\\s\\S]{0,140}` +
    `${alias}\\.is_authorized = true[\\s\\S]{0,140}` +
    `${alias}\\.deactivated_at IS NULL`
  );
  if (!/<EntityPicker[\s\S]{0,160}kind="driver"/.test(s.wizard)) failures.push("wizard canonical driver picker missing");
  if (!/driver_id:\s*input\.form\.driverId \|\| undefined/.test(s.submit)) failures.push("wizard submit must forward the snapshotted driver FK");
  if (!/FROM mdata\.drivers[\s\S]{0,220}operating_company_id = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL[\s\S]{0,100}archived_at IS NULL/.test(s.writer)) failures.push("writer active tenant driver validation missing");
  if (!/INSERT INTO mdata\.unit_border_crossings[\s\S]{0,180}operating_company_id, unit_id, driver_id/.test(s.writer)) failures.push("writer driver persistence missing");
  if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.historyRoute) || !/filters\.push\(`ubc\.driver_id = \$\$\{values\.length\}::uuid`\)/.test(s.historyRoute)) failures.push("exact driver history filter missing");
  if (!/driver_id: driverId/.test(s.reverse) || !/ListErrorBanner/.test(s.reverse)) failures.push("profile reverse must request exact driver and show errors");
  if (!/kind=["']border_crossing["']/.test(s.reverse) || !/row\.id === deepLinkCrossingId/.test(s.history)) failures.push("reverse drill must select canonical history row");
  if (!/DriverBorderCrossingsReverseSection[\s\S]{0,160}driverId=\{id\}/.test(s.profile)) failures.push("driver profile reverse mount missing");
  if (!authorizedDriverJoin("border_wizard_list_dca").test(s.writer)) failures.push("wizard read must resolve authorized shared-driver label");
  if (!authorizedDriverJoin("border_history_list_dca").test(s.historyRoute)) failures.push("history list must resolve authorized shared-driver label");
  if (!authorizedDriverJoin("border_history_detail_dca").test(s.historyRoute)) failures.push("history detail must resolve authorized shared-driver label");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "wizard", /(<EntityPicker[\s\S]{0,160})kind="driver"/, '$1kind="unit"'],
    ["payload", "submit", /driver_id:\s*input\.form\.driverId \|\| undefined/, "driver_id: undefined"],
    ["scope", "writer", /(FROM mdata\.drivers[\s\S]{0,220})operating_company_id = \$2::uuid/, "$1TRUE"],
    ["active", "writer", /(FROM mdata\.drivers[\s\S]{0,260})deactivated_at IS NULL/, "$1TRUE"],
    ["archived", "writer", /(FROM mdata\.drivers[\s\S]{0,300})archived_at IS NULL/, "$1TRUE"],
    ["filter", "historyRoute", /filters\.push\(`ubc\.driver_id = \$\$\{values\.length\}::uuid`\)/, "filters.push(`TRUE`)"],
    ["reverse", "reverse", /driver_id: driverId/, "driver_id: operatingCompanyId"],
    ["error", "reverse", /ListErrorBanner/g, "MissingErrorBanner"],
    ["drill", "reverse", /kind=["']border_crossing["']/, 'kind="driver"'],
    ["mount", "profile", /DriverBorderCrossingsReverseSection/g, "MissingDriverBorderReverse"],
    ["wizard shared driver", "writer", /border_wizard_list_dca\.is_authorized = true/, "border_wizard_list_dca.is_authorized = false"],
    ["history list shared driver", "historyRoute", /border_history_list_dca\.company_id = ubc\.operating_company_id/, "border_history_list_dca.company_id = d.operating_company_id"],
    ["history detail shared driver", "historyRoute", /border_history_detail_dca\.deactivated_at IS NULL/, "border_history_detail_dca.deactivated_at IS NOT NULL"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — driver picker→tenant writer→exact history reverse→selected crossing drill`);
