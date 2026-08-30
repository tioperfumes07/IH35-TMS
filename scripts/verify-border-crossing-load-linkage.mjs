#!/usr/bin/env node
/** @matrix-built modules=dispatch cols=load,connectivity,reverse_link,picker_law leafRe=^(dispatch\.wizard\.border_crossing_wizard_page|queues\.border_history|dispatch\.drawer\.load_detail)$ task=BORDER-CROSSING-LOAD-LINKAGE */
// LINK-THEATER-01 narrowing (2026-08-14): sibling of LINK-F5148 — load side instead of driver side.
// Real leaves: dispatch.wizard.border_crossing_wizard_page, queues.border_history, and
// LoadDetailDrawer.tsx's CustomsTab -> dispatch.drawer.load_detail (same leaf id as LINK-F5147, that
// component's dedicated surface id). "compliance" dropped entirely — CustomsTab.tsx lives under
// apps/frontend/src/components/dispatch/drawer-tabs/, not compliance; zero compliance file is read.
import fs from "node:fs";
const LABEL = "verify-border-crossing-load-linkage";
const files = {
  wizard: "apps/frontend/src/components/border-crossing/WizardStep1.tsx",
  submit: "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx",
  writer: "apps/backend/src/border-crossing/border-crossing-wizard.routes.ts",
  historyRoute: "apps/backend/src/border-crossing/border-crossing-history.routes.ts",
  history: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx",
  customs: "apps/frontend/src/components/dispatch/drawer-tabs/CustomsTab.tsx",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/<EntityPicker[\s\S]{0,160}kind="load"/.test(s.wizard)) failures.push("wizard canonical load picker missing");
  if (!/load_id:\s*input\.form\.loadId \|\| undefined/.test(s.submit)) failures.push("wizard submit must forward load FK from the mounted mutation envelope");
  if (!/FROM mdata\.loads[\s\S]{0,220}operating_company_id = \$2::uuid[\s\S]{0,100}soft_deleted_at IS NULL/.test(s.writer)) failures.push("writer active tenant load validation missing");
  if (!/INSERT INTO mdata\.unit_border_crossings[\s\S]{0,180}operating_company_id, unit_id, driver_id, load_id/.test(s.writer)) failures.push("writer load persistence missing");
  if (!/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.historyRoute) || !/filters\.push\(`ubc\.load_id = \$\$\{values\.length\}::uuid`\)/.test(s.historyRoute)) failures.push("exact load history filter missing");
  if (!/load_id: loadId/.test(s.customs) || !/ListErrorBanner/.test(s.customs)) failures.push("customs tab must request exact load and show errors");
  if (!/brokersQuery\.isError[\s\S]{0,180}Couldn't load customs brokers for this company\.[\s\S]{0,120}brokersQuery\.refetch\(\)/.test(s.customs)) failures.push("customs broker catalog failure must show exact retry");
  if (!/disabled=\{brokersQuery\.isError\}/.test(s.customs)) failures.push("customs broker picker must fail closed when its catalog fails");
  if (!/kind=["']border_crossing["']/.test(s.customs) || !/row\.id === deepLinkCrossingId/.test(s.history)) failures.push("reverse drill must select canonical history row");
  if (!/<CustomsTab loadId=\{load\.id\} operatingCompanyId=\{load\.operating_company_id\}/.test(s.drawer)) failures.push("load drawer customs mount missing");
  if (/drawer-customs-tab-stub|content ships in Block 8/.test(s.customs)) failures.push("customs tab must not remain a stub");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "wizard", /(<EntityPicker[\s\S]{0,160})kind="load"/, '$1kind="unit"'],
    ["payload", "submit", /load_id:\s*input\.form\.loadId \|\| undefined/, "load_id: undefined"],
    ["scope", "writer", /(FROM mdata\.loads[\s\S]{0,220})operating_company_id = \$2::uuid/, "$1TRUE"],
    ["active", "writer", /(FROM mdata\.loads[\s\S]{0,260})soft_deleted_at IS NULL/, "$1TRUE"],
    ["filter", "historyRoute", /filters\.push\(`ubc\.load_id = \$\$\{values\.length\}::uuid`\)/, "filters.push(`TRUE`)"],
    ["reverse", "customs", /load_id: loadId/, "load_id: operatingCompanyId"],
    ["error", "customs", /ListErrorBanner/g, "MissingErrorBanner"],
    ["broker retry", "customs", /onRetry=\{\(\) => void brokersQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["broker fail closed", "customs", /disabled=\{brokersQuery\.isError\}/, "disabled={false}"],
    ["drill", "customs", /kind=["']border_crossing["']/, 'kind="load"'],
    ["mount", "drawer", /<CustomsTab loadId=\{load\.id\}/, "<CustomsTab loadId={undefined}"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — load picker→tenant writer→exact history reverse→selected crossing drill`);
