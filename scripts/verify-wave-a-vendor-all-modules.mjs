#!/usr/bin/env node
/** Full-product vendor FK census across every module that genuinely owns it; QBO sync is excluded.
 *
 * LINK-F5166 (2026-08-14): same self-regression pattern already documented and fixed for ap_bill
 * (ACCT-F5162), trailer (LINK-F5163), and customer (LINK-F5165) — the fixed floors below
 * (p10<195, leaves<290, module-Set<20) could not tell honest correction from real loss. The
 * vertical vendor-column sweep went leaf-by-leaf with live code evidence across all 21 modules that
 * ever flagged vendor (306 leaves total) and honestly removed 191 false Required markings —
 * cash-flow, compliance, and home dropped to zero genuine vendor leaves and correctly left the
 * module set (system was added — audit.trail genuinely maps subject_type to a real vendor
 * EntityKind, found during this pass); the honest count dropped from 290+ to 115 across 18 modules.
 * Floors removed, replaced with the same per-leaf auditConnectivity + unchanged file-pattern/
 * composed-guard checks pattern used in the ap_bill/trailer/customer fixes. Module list corrected
 * (cash-flow/compliance/home dropped, system added). This aggregate census deliberately awards no
 * Built credit; representative contracts cannot prove every vendor leaf. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
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
  // Multi-line JSX (kind/id/label on separate lines, plus an honest tombstone branch for
  // unresolved vendors — LV-INVENTORY-PARTS-DEACTIVATED-VENDOR-HISTORICAL-LABEL). Independently
  // converged fix (CC-2 had the same re-anchor via 01b9b2f5f; kept this already-integrated version).
  ["apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx", /<EntityLink[\s\S]{0,60}kind="vendor"[\s\S]{0,60}id=\{row\.vendor_id\}/],
  ["apps/frontend/src/pages/finance/ArApAgingPage.tsx", /<EntityLink kind="vendor" id=\{r\.vendor_id\}/],
  ["apps/frontend/src/pages/reports/APAgingPage.tsx", /<EntityLink kind="vendor" id=\{r\.vendor_id\}/],
];
const composed = ["verify-wave-a-vendor-column.mjs", "verify-accounting-vendor-reverse-link-wired.mjs", "verify-vendor-picker-search.mjs", "verify-maint-vendors-ap-link-search.mjs", "verify-insurance-legal-reference-select.mjs"];
export function auditVendorColumn(sources, leaves) {
  const failures = [];
  if (leaves.length === 0) failures.push("vendor inventory is empty — no module claims vendor at all");
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of contracts) if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: canonical vendor FK/link contract missing`);
  return failures;
}
const leaves = collectVendorLeaves();
const sources = { routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"), files: Object.fromEntries(contracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])) };
if (process.argv.includes("--selftest")) {
  if (!auditVendorColumn(sources, []).some((failure) => failure.includes("empty"))) { console.error("verify-wave-a-vendor-all-modules SELFTEST FAIL — empty-inventory mutation escaped"); process.exit(1); }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx"] = mutated.files["apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx"].replace('kind="vendor"', 'kind="customer"');
  if (!auditVendorColumn(mutated, leaves).some((failure) => failure.includes("InventoryPartsStockPage"))) { console.error("verify-wave-a-vendor-all-modules SELFTEST FAIL — contract mutation escaped"); process.exit(1); }
  console.log("verify-wave-a-vendor-all-modules SELFTEST PASS — empty-inventory and contract mutations detected"); process.exit(0);
}
const failures = auditVendorColumn(sources, leaves);
for (const guard of composed) { if (!fs.existsSync(path.join(ROOT, "scripts", guard))) continue; const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" }); if (result.status !== 0) failures.push(`${guard}: composed guard failed\n${result.stdout}${result.stderr}`); }
if (failures.length) { console.error(`verify-wave-a-vendor-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-a-vendor-all-modules PASS — ${leaves.length} vendor leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules, every one route/surface-verified`);
