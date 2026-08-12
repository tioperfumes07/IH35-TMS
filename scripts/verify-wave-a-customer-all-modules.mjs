#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","customers","dispatch","docs","factoring","finance","fleet","home","insurance","legal","lists","maintenance","reports","safety"],"cols":["customer"],"leafRe":".*","task":"WAVE-A-customer-all-modules","vertical":"column-wave"} */
/** Full-product customer FK contract: owner sequence is P10 first, then every applicable module. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const P10 = new Set(["lists", "accounting", "dispatch", "settlements", "factoring", "banking", "customers", "vendors", "drivers", "safety"]);
const ROUTES = ["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];

export function collectCustomerLeaves(read = fs.readFileSync, readDir = fs.readdirSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) if ((leaf.required || []).includes("customer")) leaves.push({ module: spec.module, id: leaf.id, route: leaf.route_hint });
  }
  return leaves;
}

const contracts = [
  ["apps/frontend/src/pages/finance/ArApAgingPage.tsx", /<EntityLink kind="customer" id=\{r\.customer_id\}/],
  ["apps/frontend/src/pages/docs/DocsHomePage.tsx", /case "customer":/],
  ["apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx", /createKind="customer"/],
  ["apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx", /customer_id:\s*values\.customer_id \|\| undefined/],
  ["apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx", /<EntityLink kind="customer" id=\{row\.customer_id\}/],
  ["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx", /<EntityLink kind="customer" id=\{row\.customer_id\}/],
  ["apps/frontend/src/pages/insurance/InsuranceLanding.tsx", /customer's COI tab/],
];
const composed = [
  "verify-wave-a-customer-column.mjs",
  "verify-wave-a-customer-remainder-column.mjs",
  "verify-customer-reverse-link-wired.mjs",
  "verify-customer-autocomplete-canonical.mjs",
  "verify-bookload-customer-server-search.mjs",
  "verify-contract-creator-customer-search.mjs",
  "verify-customer-invoice-customer-id-deeplink.mjs",
  "verify-task-link-contract.mjs",
];

export function auditCustomerColumn(sources, leaves) {
  const failures = [];
  const p10 = leaves.filter((leaf) => P10.has(leaf.module));
  if (p10.length < 177) failures.push(`priority-10 customer inventory unexpectedly shrank to ${p10.length}`);
  if (leaves.length < 262) failures.push(`all-module customer inventory unexpectedly shrank to ${leaves.length}`);
  if (new Set(leaves.map((leaf) => leaf.module)).size < 16) failures.push("customer module inventory unexpectedly shrank");
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of contracts) if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: canonical customer FK/link contract missing`);
  return failures;
}

const leaves = collectCustomerLeaves();
const sources = {
  routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"),
  files: Object.fromEntries(contracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])),
};
if (process.argv.includes("--selftest")) {
  if (!auditCustomerColumn(sources, leaves.filter((leaf) => leaf.module !== "lists")).some((failure) => failure.includes("priority-10"))) {
    console.error("verify-wave-a-customer-all-modules SELFTEST FAIL — P10 mutation escaped"); process.exit(1);
  }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/pages/finance/ArApAgingPage.tsx"] = mutated.files["apps/frontend/src/pages/finance/ArApAgingPage.tsx"].replace('kind="customer"', 'kind="vendor"');
  if (!auditCustomerColumn(mutated, leaves).some((failure) => failure.includes("ArApAgingPage"))) {
    console.error("verify-wave-a-customer-all-modules SELFTEST FAIL — all-module mutation escaped"); process.exit(1);
  }
  console.log("verify-wave-a-customer-all-modules SELFTEST PASS — P10 and all-module mutations detected"); process.exit(0);
}
const failures = auditCustomerColumn(sources, leaves);
for (const guard of composed) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${guard}: composed guard failed\n${result.stdout}${result.stderr}`);
}
if (failures.length) { console.error(`verify-wave-a-customer-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-a-customer-all-modules PASS — P10 first (${leaves.filter((leaf) => P10.has(leaf.module)).length}), then ${leaves.length} customer leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules`);
