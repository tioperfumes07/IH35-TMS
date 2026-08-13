#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","fleet","fuel","insurance","lists","maintenance","safety"],"cols":["trailer"],"leafRe":".*","task":"WAVE-A-trailer-all-modules","vertical":"column-wave"} */
/** Full-product trailer contract. Canonical dispatch persistence is assignment history, never loads.trailer_id. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const P10 = new Set(["lists", "accounting", "dispatch", "settlements", "factoring", "banking", "customers", "vendors", "drivers", "safety"]);
const ROUTES = ["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];
export function collectTrailerLeaves(read = fs.readFileSync, readDir = fs.readdirSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) if ((leaf.required || []).includes("trailer")) leaves.push({
      module: spec.module,
      id: leaf.id,
      route: leaf.route_hint,
      surfaceKind: leaf.surface_kind,
      surfacePath: leaf.surface_path,
    });
  }
  return leaves;
}
const contracts = [
  ["apps/frontend/src/pages/fleet/TrailerProfilePage.tsx", /linkage=\{\{ kind: "trailer_id", id \}\}/],
  ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", /trailer_id:\s*form\.trailer_id \|\| null/],
  ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", /kind="trailer"/],
  ["apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx", /trailer_id:\s*string/],
  ["apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx", /trailer_id:\s*trailerId \|\| null/],
  ["apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx", /kind="trailer"/],
  ["apps/frontend/src/pages/maintenance/FleetTablePage.tsx", /\{ key: "trailer", label: "Trailers" \}/],
];
const composed = ["verify-wave-a-trailer-column.mjs", "verify-bookload-equipment-entitypicker-search.mjs", "verify-claim-load-reverse-and-driver-create.mjs", "verify-safety-incidents-reverse-link-wired.mjs"];
export function auditTrailerColumn(sources, leaves) {
  const failures = [];
  const p10 = leaves.filter((leaf) => P10.has(leaf.module));
  if (p10.length < 49) failures.push(`priority-10 trailer inventory unexpectedly shrank to ${p10.length}`);
  if (leaves.length < 93) failures.push(`all-module trailer inventory unexpectedly shrank to ${leaves.length}`);
  if (new Set(leaves.map((leaf) => leaf.module)).size < 6) failures.push("trailer module inventory unexpectedly shrank");
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of contracts) if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: canonical trailer FK/link contract missing`);
  return failures;
}
const leaves = collectTrailerLeaves();
const sources = { routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"), files: Object.fromEntries(contracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])) };
if (process.argv.includes("--selftest")) {
  if (!auditTrailerColumn(sources, leaves.filter((leaf) => leaf.module !== "lists")).some((failure) => failure.includes("priority-10"))) { console.error("verify-wave-a-trailer-all-modules SELFTEST FAIL — P10 mutation escaped"); process.exit(1); }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/components/insurance/ClaimCreateModal.tsx"] = mutated.files["apps/frontend/src/components/insurance/ClaimCreateModal.tsx"].replace('kind="trailer"', 'kind="unit"');
  if (!auditTrailerColumn(mutated, leaves).some((failure) => failure.includes("ClaimCreateModal"))) { console.error("verify-wave-a-trailer-all-modules SELFTEST FAIL — all-module mutation escaped"); process.exit(1); }
  console.log("verify-wave-a-trailer-all-modules SELFTEST PASS — P10 and all-module mutations detected"); process.exit(0);
}
const failures = auditTrailerColumn(sources, leaves);
for (const guard of composed) { if (!fs.existsSync(path.join(ROOT, "scripts", guard))) continue; const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" }); if (result.status !== 0) failures.push(`${guard}: composed guard failed\n${result.stdout}${result.stderr}`); }
if (failures.length) { console.error(`verify-wave-a-trailer-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-a-trailer-all-modules PASS — P10 first (${leaves.filter((leaf) => P10.has(leaf.module)).length}), then ${leaves.length} trailer leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules`);
