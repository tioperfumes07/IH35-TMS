#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","compliance","customers","dispatch","docs","factoring","finance","fleet","fuel","home","insurance","inventory","legal","lists","maintenance","reports","safety","vendors"],"cols":["vendor"],"leafRe":".*","task":"WAVE-A-vendor-all-modules","vertical":"column-wave"} */
/** Full-product vendor FK contract: P10 first, then every applicable module; QBO sync is excluded. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const P10 = new Set(["lists", "accounting", "dispatch", "settlements", "factoring", "banking", "customers", "vendors", "drivers", "safety"]);
const ROUTES = ["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];
export function collectVendorLeaves(read = fs.readFileSync, readDir = fs.readdirSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) if ((leaf.required || []).includes("vendor")) leaves.push({ module: spec.module, id: leaf.id, route: leaf.route_hint });
  }
  return leaves;
}
const contracts = [
  ["apps/frontend/src/pages/docs/DocsHomePage.tsx", /case "vendor":/],
  ["apps/frontend/src/pages/compliance/RequiredDocumentsSection.tsx", /\{ id: "vendor", label: "Vendors" \}/],
  ["apps/frontend/src/pages/inventory/PartCreateDrawer.tsx", /vendor_id:\s*data\.vendor_id\.trim\(\) \|\| undefined/],
  ["apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx", /<EntityLink kind="vendor" id=\{row\.vendor_id\}/],
  ["apps/frontend/src/pages/finance/ArApAgingPage.tsx", /<EntityLink kind="vendor" id=\{r\.vendor_id\}/],
  ["apps/frontend/src/pages/reports/APAgingPage.tsx", /<EntityLink kind="vendor" id=\{r\.vendor_id\}/],
];
const composed = ["verify-wave-a-vendor-column.mjs", "verify-accounting-vendor-reverse-link-wired.mjs", "verify-vendor-picker-search.mjs", "verify-maint-vendors-ap-link-search.mjs", "verify-insurance-legal-reference-select.mjs"];
export function auditVendorColumn(sources, leaves) {
  const failures = [];
  const p10 = leaves.filter((leaf) => P10.has(leaf.module));
  if (p10.length < 195) failures.push(`priority-10 vendor inventory unexpectedly shrank to ${p10.length}`);
  if (leaves.length < 290) failures.push(`all-module vendor inventory unexpectedly shrank to ${leaves.length}`);
  if (new Set(leaves.map((leaf) => leaf.module)).size < 20) failures.push("vendor module inventory unexpectedly shrank");
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of contracts) if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: canonical vendor FK/link contract missing`);
  return failures;
}
const leaves = collectVendorLeaves();
const sources = { routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"), files: Object.fromEntries(contracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])) };
if (process.argv.includes("--selftest")) {
  if (!auditVendorColumn(sources, leaves.filter((leaf) => leaf.module !== "lists")).some((failure) => failure.includes("priority-10"))) { console.error("verify-wave-a-vendor-all-modules SELFTEST FAIL — P10 mutation escaped"); process.exit(1); }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx"] = mutated.files["apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx"].replace('kind="vendor"', 'kind="customer"');
  if (!auditVendorColumn(mutated, leaves).some((failure) => failure.includes("InventoryPartsStockPage"))) { console.error("verify-wave-a-vendor-all-modules SELFTEST FAIL — all-module mutation escaped"); process.exit(1); }
  console.log("verify-wave-a-vendor-all-modules SELFTEST PASS — P10 and all-module mutations detected"); process.exit(0);
}
const failures = auditVendorColumn(sources, leaves);
for (const guard of composed) { if (!fs.existsSync(path.join(ROOT, "scripts", guard))) continue; const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" }); if (result.status !== 0) failures.push(`${guard}: composed guard failed\n${result.stdout}${result.stderr}`); }
if (failures.length) { console.error(`verify-wave-a-vendor-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-a-vendor-all-modules PASS — P10 first (${leaves.filter((leaf) => P10.has(leaf.module)).length}), then ${leaves.length} vendor leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules`);
