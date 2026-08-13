#!/usr/bin/env node
/** @matrix-built modules=dispatch,drivers,compliance cols=driver,connectivity,reverse_link,picker_law */
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
  if (!/<EntityPicker[\s\S]{0,160}kind="driver"/.test(s.wizard)) failures.push("wizard canonical driver picker missing");
  if (!/driver_id:\s*form\.driverId \|\| undefined/.test(s.submit)) failures.push("wizard submit must forward driver FK");
  if (!/FROM mdata\.drivers[\s\S]{0,220}operating_company_id = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL[\s\S]{0,100}archived_at IS NULL/.test(s.writer)) failures.push("writer active tenant driver validation missing");
  if (!/INSERT INTO mdata\.unit_border_crossings[\s\S]{0,180}operating_company_id, unit_id, driver_id/.test(s.writer)) failures.push("writer driver persistence missing");
  if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.historyRoute) || !/filters\.push\(`ubc\.driver_id = \$\$\{values\.length\}::uuid`\)/.test(s.historyRoute)) failures.push("exact driver history filter missing");
  if (!/driver_id: driverId/.test(s.reverse) || !/ListErrorBanner/.test(s.reverse)) failures.push("profile reverse must request exact driver and show errors");
  if (!/border-crossing\/history\?crossing_id=/.test(s.reverse) || !/row\.id === deepLinkCrossingId/.test(s.history)) failures.push("reverse drill must select canonical history row");
  if (!/DriverBorderCrossingsReverseSection[\s\S]{0,160}driverId=\{id\}/.test(s.profile)) failures.push("driver profile reverse mount missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "wizard", /(<EntityPicker[\s\S]{0,160})kind="driver"/, '$1kind="unit"'],
    ["payload", "submit", /driver_id:\s*form\.driverId \|\| undefined/, "driver_id: undefined"],
    ["scope", "writer", /(FROM mdata\.drivers[\s\S]{0,220})operating_company_id = \$2::uuid/, "$1TRUE"],
    ["active", "writer", /(FROM mdata\.drivers[\s\S]{0,260})deactivated_at IS NULL/, "$1TRUE"],
    ["archived", "writer", /(FROM mdata\.drivers[\s\S]{0,300})archived_at IS NULL/, "$1TRUE"],
    ["filter", "historyRoute", /filters\.push\(`ubc\.driver_id = \$\$\{values\.length\}::uuid`\)/, "filters.push(`TRUE`)"],
    ["reverse", "reverse", /driver_id: driverId/, "driver_id: operatingCompanyId"],
    ["error", "reverse", /ListErrorBanner/g, "MissingErrorBanner"],
    ["drill", "reverse", /history\?crossing_id=/, "history?driver_id="],
    ["mount", "profile", /DriverBorderCrossingsReverseSection/g, "MissingDriverBorderReverse"],
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
