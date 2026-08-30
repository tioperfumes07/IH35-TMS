#!/usr/bin/env node
/** @matrix-built modules=dispatch,vendors cols=vendor,connectivity,reverse_link,picker_law leafRe=^(dispatch\.wizard\.border_crossing_wizard_page|queues\.border_history|detail\.profile)$ task=BORDER-CROSSING-BROKER-LINKAGE */
// LINK-THEATER-01 narrowing (2026-08-14): sibling of LINK-F5148 (border-crossing-driver-linkage) —
// same wizard/history surfaces, broker/vendor side instead of driver side. Real leaves:
// dispatch.wizard.border_crossing_wizard_page, queues.border_history, and VendorDetail.tsx ->
// detail.profile (/vendors/:id, confirmed in vendors.required.json). "compliance" dropped — zero
// compliance file is read anywhere in this guard.
import fs from "node:fs";
const LABEL = "verify-border-crossing-broker-linkage";
const files = {
  picker: "apps/frontend/src/components/border-crossing/WizardStep4.tsx",
  submit: "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx",
  writer: "apps/backend/src/border-crossing/border-crossing-wizard.routes.ts",
  historyRoute: "apps/backend/src/border-crossing/border-crossing-history.routes.ts",
  history: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx",
  reverse: "apps/frontend/src/components/dispatch/VendorBorderCrossingsReverseSection.tsx",
  profile: "apps/frontend/src/pages/VendorDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/id="border-crossing-broker-picker"[\s\S]{0,300}value=\{form\.customsBrokerId/.test(s.picker)) failures.push("category-scoped broker picker missing");
  if (!/allowAddNew=\{\{\s*label:\s*["']\+ Add new vendor["']/.test(s.picker)) failures.push("broker picker must offer canonical + Add new vendor first row");
  if (!/<InlineCreateDrawer[\s\S]{0,240}kind="vendor"[\s\S]{0,240}operatingCompanyId=\{operatingCompanyId\}/.test(s.picker)) failures.push("broker picker must open canonical company-scoped vendor creator");
  if (!/customs_broker_id:\s*input\.form\.customsBrokerId \|\| undefined/.test(s.submit)) failures.push("wizard submit must forward broker vendor FK from the immutable submit snapshot");
  if (!/SELECT id::text, vendor_name AS name, vendor_category[\s\S]{0,240}ORDER BY vendor_name/.test(s.writer)) failures.push("broker picker must read the canonical vendor_name column and preserve its name API contract");
  if (!/v\.vendor_name AS customs_broker_name/.test(s.writer)) failures.push("wizard result must resolve the canonical broker vendor_name");
  if (!/SELECT ubc\.\*[\s\S]{0,240}v\.vendor_name AS customs_broker_name/.test(s.historyRoute)) failures.push("history detail must resolve the canonical broker vendor_name");
  if (!/FROM mdata\.vendors[\s\S]{0,260}operating_company_id = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL[\s\S]{0,100}vendor_category = 'customs_broker'/.test(s.writer)) failures.push("writer active tenant customs-broker validation missing");
  if (!/customs_broker_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.historyRoute) || !/filters\.push\(`ubc\.customs_broker_id = \$\$\{values\.length\}::uuid`\)/.test(s.historyRoute)) failures.push("exact broker history filter missing");
  if (!/customs_broker_id: vendorId/.test(s.reverse) || !/ListErrorBanner/.test(s.reverse)) failures.push("vendor reverse must request exact broker and show errors");
  if (!/kind="vendor"[\s\S]{0,160}selected\.customs_broker_id/.test(s.history)) failures.push("history detail must drill to canonical vendor");
  if (!/VendorBorderCrossingsReverseSection[\s\S]{0,160}vendorId=\{vendor\.id\}/.test(s.profile)) failures.push("vendor profile reverse mount missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "picker", /id="border-crossing-broker-picker"/, 'id="wrong-picker"'],
    ["picker-create-row", "picker", /label:\s*["']\+ Add new vendor["']/, 'label: "No create"'],
    ["picker-canonical-creator", "picker", /(<InlineCreateDrawer[\s\S]{0,120})kind="vendor"/, '$1kind="customer"'],
    ["payload", "submit", /customs_broker_id:\s*input\.form\.customsBrokerId \|\| undefined/, "customs_broker_id: undefined"],
    ["picker-label", "writer", /vendor_name AS name/, "name"],
    ["picker-order", "writer", /ORDER BY vendor_name/, "ORDER BY name"],
    ["wizard-label", "writer", /v\.vendor_name AS customs_broker_name/, "v.name AS customs_broker_name"],
    ["history-label", "historyRoute", /(SELECT ubc\.\*[\s\S]{0,240})v\.vendor_name AS customs_broker_name/, "$1v.name AS customs_broker_name"],
    ["scope", "writer", /(FROM mdata\.vendors[\s\S]{0,260})operating_company_id = \$2::uuid/, "$1TRUE"],
    ["active", "writer", /(if \(data\.customs_broker_id\)[\s\S]{0,500})deactivated_at IS NULL/, "$1TRUE"],
    ["category", "writer", /(if \(data\.customs_broker_id\)[\s\S]{0,600})vendor_category = 'customs_broker'/, "$1TRUE"],
    ["filter", "historyRoute", /filters\.push\(`ubc\.customs_broker_id = \$\$\{values\.length\}::uuid`\)/, "filters.push(`TRUE`)"],
    ["reverse", "reverse", /customs_broker_id: vendorId/, "customs_broker_id: operatingCompanyId"],
    ["drill", "history", /kind="vendor"/, 'kind="driver"'],
    ["mount", "profile", /VendorBorderCrossingsReverseSection/g, "MissingBrokerReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — broker picker→tenant/category writer→vendor reverse→canonical drills`);
