#!/usr/bin/env node
/** Full-product unit FK census: priority 10 first, then every applicable module.
 * This aggregate route/representative-contract guard deliberately awards no Built credit.
 * Exact child guards own leaf-specific matrix evidence. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const P10 = new Set(["lists", "accounting", "dispatch", "settlements", "factoring", "banking", "customers", "vendors", "drivers", "safety"]);
const ROUTES = ["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];
export function collectUnitLeaves(read = fs.readFileSync, readDir = fs.readdirSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) if ((leaf.required || []).includes("unit")) leaves.push({ module: spec.module, id: leaf.id, route: leaf.route_hint });
  }
  return leaves;
}
const contracts = [
  ["apps/frontend/src/pages/docs/DocsHomePage.tsx", /case "unit":/],
  ["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx", /<EntityLink kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/components/tasks/CreateTaskModal.tsx", /"vendor" \| "driver" \| "unit"/],
  ["apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx", /<EntityLink kind="unit" id=\{r\.unit_id\}/],
  ["apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx", /<EntityLink kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx", /unit_id:\s*unitId/],
  ["apps/frontend/src/components/insurance/PolicyCreateWizard.tsx", /unit_ids:\s*selectedUnits\.map\(\(unit\)\s*=>\s*unit\.value\)/],
];
const composed = ["verify-wave-a-unit-column.mjs", "verify-bookload-equipment-entitypicker-search.mjs", "verify-assign-truck-unit-entity-picker.mjs", "verify-task-link-contract.mjs", "verify-docs-file-link-entity-contract.mjs", "verify-legal-reverse-drill-fleet-insurance.mjs"];
export function auditUnitColumn(sources, leaves) {
  const failures = [];
  const p10 = leaves.filter((leaf) => P10.has(leaf.module));
  if (p10.length < 49) failures.push(`priority-10 unit inventory unexpectedly shrank to ${p10.length}`);
  if (leaves.length < 178) failures.push(`all-module unit inventory unexpectedly shrank to ${leaves.length}`);
  if (new Set(leaves.map((leaf) => leaf.module)).size < 19) failures.push("unit module inventory unexpectedly shrank");
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of contracts) if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: canonical unit FK/link contract missing`);
  return failures;
}
const leaves = collectUnitLeaves();
const sources = { routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"), files: Object.fromEntries(contracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])) };
if (process.argv.includes("--selftest")) {
  if (!auditUnitColumn(sources, leaves.filter((leaf) => leaf.module !== "safety")).some((failure) => failure.includes("priority-10"))) { console.error("verify-wave-a-unit-all-modules SELFTEST FAIL — P10 mutation escaped"); process.exit(1); }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx"] = mutated.files["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx"].replace('kind="unit"', 'kind="driver"');
  if (!auditUnitColumn(mutated, leaves).some((failure) => failure.includes("DispatcherActiveLoadsPanel"))) { console.error("verify-wave-a-unit-all-modules SELFTEST FAIL — all-module mutation escaped"); process.exit(1); }
  const policyMutated = structuredClone(sources);
  policyMutated.files["apps/frontend/src/components/insurance/PolicyCreateWizard.tsx"] = policyMutated.files["apps/frontend/src/components/insurance/PolicyCreateWizard.tsx"].replace("unit_ids: selectedUnits.map((unit) => unit.value)", "unit_ids: []");
  if (!auditUnitColumn(policyMutated, leaves).some((failure) => failure.includes("PolicyCreateWizard"))) { console.error("verify-wave-a-unit-all-modules SELFTEST FAIL — insurance unit payload mutation escaped"); process.exit(1); }
  console.log("verify-wave-a-unit-all-modules SELFTEST PASS — P10, all-module, and insurance payload mutations detected"); process.exit(0);
}
const failures = auditUnitColumn(sources, leaves);
for (const guard of composed) { if (!fs.existsSync(path.join(ROOT, "scripts", guard))) continue; const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" }); if (result.status !== 0) failures.push(`${guard}: composed guard failed\n${result.stdout}${result.stderr}`); }
if (failures.length) { console.error(`verify-wave-a-unit-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-a-unit-all-modules PASS — P10 first (${leaves.filter((leaf) => P10.has(leaf.module)).length}), then ${leaves.length} unit leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules`);
