#!/usr/bin/env node
/** Full-product trailer census. Canonical dispatch persistence is assignment history, never loads.trailer_id.
 *
 * LINK-F5163 (2026-08-14): same self-regression pattern already documented and fixed for the ap_bill
 * column (ACCT-F5162) — the fixed floors below (`p10.length < 49`, `leaves.length < 93`, module-Set
 * size `< 6`) could not tell "we lost real wiring" from "we corrected a false claim". The vertical
 * trailer-column sweep went leaf-by-leaf with live code evidence across dispatch/fleet/lists/
 * insurance/maintenance/safety (115 leaves total) and honestly removed 64 false trailer Required
 * markings — the `lists` module's 20 fleet-catalog pages turned out to own ZERO trailer leaves (pure
 * catalog-VALUE CRUD, no trailer record reference anywhere), correctly dropping it out of the module
 * set entirely, and the honest count dropped from 93+ to 51. Floors removed, replaced with the same
 * per-leaf auditConnectivity + unchanged file-pattern/composed-guard checks pattern used in the
 * ap_bill fix. Module list corrected to the honest 6 that still own trailer leaves (dispatch/fleet/
 * fuel/insurance/maintenance/safety; `lists` dropped, `fuel` added — fuel.modal.create_fuel_transaction
 * genuinely captures trailer_id via a real EntityPicker). This aggregate guard awards no Built
 * credit because representative contracts do not prove every trailer leaf.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const ROUTES = ["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];
export function collectTrailerLeaves(read = fs.readFileSync, readDir = fs.readdirSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) if ((leaf.required || []).includes("trailer")) leaves.push({ module: spec.module, id: leaf.id, route: leaf.route_hint });
  }
  return leaves;
}
const contracts = [
  ["apps/frontend/src/pages/fleet/TrailerProfilePage.tsx", /linkage=\{\{ kind: "trailer_id", id \}\}/],
  ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", /trailer_id:\s*form\.trailer_id \|\| null/],
  ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", /kind="trailer"/],
  ["apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx", /trailer_id:\s*string/],
  ["apps/frontend/src/pages/maintenance/FleetTablePage.tsx", /\{ key: "trailer", label: "Trailers" \}/],
];
const composed = ["verify-wave-a-trailer-column.mjs", "verify-bookload-equipment-entitypicker-search.mjs", "verify-claim-load-reverse-and-driver-create.mjs", "verify-safety-incidents-reverse-link-wired.mjs"];
export function auditTrailerColumn(sources, leaves) {
  const failures = [];
  if (leaves.length === 0) failures.push("trailer inventory is empty — no module claims trailer at all");
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of contracts) if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: canonical trailer FK/link contract missing`);
  return failures;
}
const leaves = collectTrailerLeaves();
const sources = { routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"), files: Object.fromEntries(contracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])) };
if (process.argv.includes("--selftest")) {
  if (!auditTrailerColumn(sources, []).some((failure) => failure.includes("empty"))) { console.error("verify-wave-a-trailer-all-modules SELFTEST FAIL — empty-inventory mutation escaped"); process.exit(1); }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/components/insurance/ClaimCreateModal.tsx"] = mutated.files["apps/frontend/src/components/insurance/ClaimCreateModal.tsx"].replace('kind="trailer"', 'kind="unit"');
  if (!auditTrailerColumn(mutated, leaves).some((failure) => failure.includes("ClaimCreateModal"))) { console.error("verify-wave-a-trailer-all-modules SELFTEST FAIL — ClaimCreateModal contract mutation escaped"); process.exit(1); }
  const mutated2 = structuredClone(sources);
  mutated2.files["apps/frontend/src/pages/maintenance/FleetTablePage.tsx"] = mutated2.files["apps/frontend/src/pages/maintenance/FleetTablePage.tsx"].replace('{ key: "trailer", label: "Trailers" }', '{ key: "trailer_x", label: "Trailers" }');
  if (!auditTrailerColumn(mutated2, leaves).some((failure) => failure.includes("FleetTablePage"))) { console.error("verify-wave-a-trailer-all-modules SELFTEST FAIL — FleetTablePage contract mutation escaped"); process.exit(1); }
  console.log("verify-wave-a-trailer-all-modules SELFTEST PASS — empty-inventory and per-file contract mutations detected"); process.exit(0);
}
const failures = auditTrailerColumn(sources, leaves);
for (const guard of composed) { if (!fs.existsSync(path.join(ROOT, "scripts", guard))) continue; const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" }); if (result.status !== 0) failures.push(`${guard}: composed guard failed\n${result.stdout}${result.stderr}`); }
if (failures.length) { console.error(`verify-wave-a-trailer-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-a-trailer-all-modules PASS — ${leaves.length} trailer leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules, every one route/surface-verified`);
