#!/usr/bin/env node
/** Full-product load FK census. Historical imports are not assigned invented load FKs.
 * This aggregate route/representative-contract guard awards no Built credit. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const P10 = new Set(["lists", "accounting", "dispatch", "settlements", "factoring", "banking", "customers", "vendors", "drivers", "safety"]);
const ROUTES = ["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];
export function collectLoadLeaves(read = fs.readFileSync, readDir = fs.readdirSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) if ((leaf.required || []).includes("load")) leaves.push({ module: spec.module, id: leaf.id, route: leaf.route_hint });
  }
  return leaves;
}
const contracts = [
  ["apps/frontend/src/pages/docs/DocsHomePage.tsx", /case "load":/],
  ["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx", /<EntityLink kind="load" id=\{row\.id\}/],
  ["apps/frontend/src/components/tasks/CreateTaskModal.tsx", /\{ value: "load", label: "Load" \}/],
  ["apps/frontend/src/components/drivers/LoadHistoryTab.tsx", /<EntityLink kind="load" id=\{row\.id\}/],
  ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", /load_id:\s*form\.load_id \|\| null/],
  ["apps/frontend/src/pages/reports/DispatchMarginPage.tsx", /<EntityLink kind="load" id=\{row\.load_id\}/],
  ["apps/frontend/src/components/expenses/recordExpenseSubmit.ts", /load_id:\s*values\.loadId/],
];
const composed = ["verify-wave-a-load-column.mjs", "verify-book-load-stamps-linkage-fks.mjs", "verify-driver-load-reverse-link-wired.mjs", "verify-canonical-load-nav.mjs", "verify-task-link-contract.mjs", "verify-docs-file-link-entity-contract.mjs", "verify-claim-load-reverse-and-driver-create.mjs"];
export function auditLoadColumn(sources, leaves) {
  const failures = [];
  const p10 = leaves.filter((leaf) => P10.has(leaf.module));
  if (p10.length < 94) failures.push(`priority-10 load inventory unexpectedly shrank to ${p10.length}`);
  // LINK-F5169 classified the final blanket Required tail leaf-by-leaf, leaving 134 genuine load
  // leaves at the time. Floor lowered to 131 (2026-08-20, CC-3) to match #9817
  // FLEET-UNIT-TRIP-COST-LOAD-REVERSE-INFLATION, a legitimate, documented honesty correction that
  // dropped `load`+`reverse_link` from unit.profile.trip_cost (a ZIP-only estimator with no
  // load select/create/reverse drill — the leaf never should have claimed a load dependency it
  // didn't have). #13510 then removed the same false load/reverse inflation from
  // `unit.edit.quick_availability`: it patches unit availability/default-driver attributes and owns
  // no load picker, payload FK, or reverse relationship. Re-verified against the current
  // required.json files, not board prose: 130 total / 97 P10 / 18 modules. #14506 then removed
  // the false per-advance load Required from factoring accounting.list/submit/detail: one advance
  // batches many invoices and correctly reaches loads through each invoice.source_load_id; the
  // advance header has no load_id. Current honest floor is 127 total / 94 P10 / 18 modules.
  // This floor may
  // only ever go DOWN for a documented un-inflation like #9817 — never UP without a genuinely new
  // load leaf actually being built.
  if (leaves.length < 127) failures.push(`all-module load inventory unexpectedly shrank to ${leaves.length}`);
  for (const id of ["accounting.list", "accounting.submit", "accounting.detail"]) {
    if (leaves.some((leaf) => leaf.module === "factoring" && leaf.id === id)) failures.push(`factoring:${id} must not invent a per-advance load FK`);
  }
  if (new Set(leaves.map((leaf) => leaf.module)).size < 18) failures.push("load module inventory unexpectedly shrank");
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of contracts) if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: canonical load FK/link contract missing`);
  return failures;
}
const leaves = collectLoadLeaves();
const sources = { routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"), files: Object.fromEntries(contracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])) };
if (process.argv.includes("--selftest")) {
  const plantedP10Leaf = leaves.find((leaf) => P10.has(leaf.module));
  if (!auditLoadColumn(sources, leaves.filter((leaf) => leaf !== plantedP10Leaf)).some((failure) => failure.includes("priority-10"))) { console.error("verify-wave-a-load-all-modules SELFTEST FAIL — P10 mutation escaped"); process.exit(1); }
  const plantedAllModuleLeaf = leaves.find((leaf) => !P10.has(leaf.module));
  if (!plantedAllModuleLeaf || !auditLoadColumn(sources, leaves.filter((leaf) => leaf !== plantedAllModuleLeaf)).some((failure) => failure.includes("all-module load inventory"))) { console.error("verify-wave-a-load-all-modules SELFTEST FAIL — all-module inventory mutation escaped"); process.exit(1); }
  if (!auditLoadColumn(sources, [...leaves, { module: "factoring", id: "accounting.detail", route: "/accounting/factoring/:id" }]).some((failure) => failure.includes("must not invent"))) { console.error("verify-wave-a-load-all-modules SELFTEST FAIL — factoring false-applicability mutation escaped"); process.exit(1); }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx"] = mutated.files["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx"].replaceAll('kind="load"', 'kind="unit"');
  if (!auditLoadColumn(mutated, leaves).some((failure) => failure.includes("DispatcherActiveLoadsPanel"))) { console.error("verify-wave-a-load-all-modules SELFTEST FAIL — all-module mutation escaped"); process.exit(1); }
  console.log("verify-wave-a-load-all-modules SELFTEST PASS — P10 inventory, all-module inventory, and canonical drill mutations detected"); process.exit(0);
}
const failures = auditLoadColumn(sources, leaves);
for (const guard of composed) { if (!fs.existsSync(path.join(ROOT, "scripts", guard))) continue; const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" }); if (result.status !== 0) failures.push(`${guard}: composed guard failed\n${result.stdout}${result.stderr}`); }
if (failures.length) { console.error(`verify-wave-a-load-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-a-load-all-modules PASS — P10 first (${leaves.filter((leaf) => P10.has(leaf.module)).length}), then ${leaves.length} load leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules`);
