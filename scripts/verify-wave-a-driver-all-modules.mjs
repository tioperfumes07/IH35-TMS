#!/usr/bin/env node
/**
 * Full-product driver FK census. Sequence is deliberate: prove the priority-10 inventory first,
 * then prove every remaining module in the same run. Required.json is the inventory, so a newly
 * added driver leaf/module joins this ratchet automatically rather than falling outside a hand list.
 * This aggregate guard awards no Built credit; representative contracts cannot prove every leaf.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const P10 = new Set(["lists", "accounting", "dispatch", "settlements", "factoring", "banking", "customers", "vendors", "drivers", "safety"]);
const ROUTES = ["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];

export function collectDriverLeaves(read = fs.readFileSync, readDir = fs.readdirSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) {
      if ((leaf.required || []).includes("driver")) leaves.push({ module: spec.module, id: leaf.id, route: leaf.route_hint });
    }
  }
  return leaves;
}

const representativeContracts = [
  ["apps/frontend/src/pages/compliance/HosViewerSection.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/docs/DocsHomePage.tsx", /EntityLink/],
  ["apps/frontend/src/pages/home/DriverHubReportingPage.tsx", /<EntityLink kind="driver" id=\{r\.driver_id\}/],
  ["apps/frontend/src/pages/reports/runners/RunnerFilters.tsx", /kind="driver"/],
  // CC-2 GUARD 2026-08-19: re-anchored — a "customer" task target type was added to the union
  // (real feature expansion), pushing the literal type-cast text past the old exact match; the
  // real kind={entityKind as ...} driver wiring is unchanged.
  ["apps/frontend/src/components/tasks/CreateTaskModal.tsx", /kind=\{entityKind as "customer" \| "vendor" \| "driver" \| "unit" \| "load"\}/],
  ["apps/frontend/src/components/fleet/EditVehicleModal.tsx", /kind="driver"/],
  ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", /driver_id:\s*form\.driver_id \|\| null/],
  ["apps/frontend/src/components/legal/LegalMattersReverseSection.tsx", /related_driver_id/],
  ["apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx", /kind="driver"/],
];

const composedGuards = [
  "verify-wave-a-driver-column.mjs",
  "verify-wave-a-lists-driver-column.mjs",
  "verify-entity-picker-driver-kind-sweep.mjs",
  "verify-inline-driver-picker-server-search.mjs",
  "verify-driver-load-history-entitylink.mjs",
  "verify-task-link-contract.mjs",
  "verify-docs-file-link-entity-contract.mjs",
  "verify-driver-hub-request-driver-link.mjs",
];

export function auditDriverColumn(sources, leaves) {
  const failures = [];
  const p10Leaves = leaves.filter((leaf) => P10.has(leaf.module));
  if (p10Leaves.length < 139) failures.push(`priority-10 driver inventory unexpectedly shrank to ${p10Leaves.length}`);
  if (leaves.length < 209) failures.push(`all-module driver inventory unexpectedly shrank to ${leaves.length}`);
  const modules = new Set(leaves.map((leaf) => leaf.module));
  if (modules.size < 23) failures.push(`driver module inventory unexpectedly shrank to ${modules.size}`);
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of representativeContracts) {
    if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: canonical driver FK picker/link contract missing`);
  }
  return failures;
}

const leaves = collectDriverLeaves();
const sources = {
  routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"),
  files: Object.fromEntries(representativeContracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])),
};

if (process.argv.includes("--selftest")) {
  const plantedP10Leaf = leaves.find((leaf) => P10.has(leaf.module));
  const p10Mutation = leaves.filter((leaf) => leaf !== plantedP10Leaf);
  if (!auditDriverColumn(sources, p10Mutation).some((failure) => failure.includes("priority-10"))) {
    console.error("verify-wave-a-driver-all-modules SELFTEST FAIL — P10 inventory mutation escaped");
    process.exit(1);
  }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/pages/compliance/HosViewerSection.tsx"] = mutated.files["apps/frontend/src/pages/compliance/HosViewerSection.tsx"].replace('kind="driver"', 'kind="customer"');
  if (!auditDriverColumn(mutated, leaves).some((failure) => failure.includes("HosViewerSection"))) {
    console.error("verify-wave-a-driver-all-modules SELFTEST FAIL — all-module FK mutation escaped");
    process.exit(1);
  }
  console.log("verify-wave-a-driver-all-modules SELFTEST PASS — P10 and all-module mutations detected");
  process.exit(0);
}

const failures = auditDriverColumn(sources, leaves);
for (const guard of composedGuards) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${guard}: composed guard failed\n${result.stdout}${result.stderr}`);
}
if (failures.length) {
  console.error(`verify-wave-a-driver-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`verify-wave-a-driver-all-modules PASS — P10 first (${leaves.filter((leaf) => P10.has(leaf.module)).length}), then ${leaves.length} driver leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules`);
