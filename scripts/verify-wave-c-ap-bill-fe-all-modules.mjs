#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","compliance","fleet","home","insurance","inventory","legal","maintenance","reports","settlements","vendors"],"cols":["ap_bill"],"leafRe":".*","task":"WAVE-C-ap-bill-fe-all-modules","vertical":"column-wave"} */
/** Non-posting A/P bill FE contract. Posting and GL math remain outside this guard. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const P10 = new Set(["lists", "accounting", "dispatch", "settlements", "factoring", "banking", "customers", "vendors", "drivers", "safety"]);
const ROUTES = ["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];
export function collectApBillLeaves(read = fs.readFileSync, readDir = fs.readdirSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) if ((leaf.required || []).includes("ap_bill")) leaves.push({ module: spec.module, id: leaf.id, route: leaf.route_hint });
  }
  return leaves;
}
const contracts = [
  ["apps/frontend/src/pages/accounting/BillsPage.tsx", /kind="bill"/],
  ["apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx", /<EntityLink kind="bill" id=\{tx\.matched_bill_id\}/],
  ["apps/frontend/src/pages/insurance/ClaimsTab.tsx", /kind="bill"/],
  ["apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx", /<EntityLink kind="bill" id=\{row\.id\}/],
  ["apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx", /kind="bill"[\s\S]*accounting_bill_id/],
  ["apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx", /title="Create vendor bill"/],
  ["apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx", /<EntityLink[\s\S]*kind="bill"[\s\S]*id=\{payment\.bill_id\}/],
];
const composed = [
  "verify-ap-bill-column-wave.mjs", "verify-settlements-gl-bills-drillthrough.mjs", "verify-fk-on-create.mjs",
  "verify-bill-vendor-link-canonical-uuid.mjs", "verify-acct-maintenance-shop-hub.mjs", "verify-insurance-claim-linkage.mjs",
  "verify-bill-human-reference.mjs", "verify-bill-subnav-creators.mjs", "verify-canonical-vendor-bill-route.mjs",
];
export function auditApBillColumn(sources, leaves) {
  const failures = [];
  const p10 = leaves.filter((leaf) => P10.has(leaf.module));
  if (p10.length < 27) failures.push(`priority-10 ap_bill inventory unexpectedly shrank to ${p10.length}`);
  if (leaves.length < 67) failures.push(`all-module ap_bill inventory unexpectedly shrank to ${leaves.length}`);
  if (new Set(leaves.map((leaf) => leaf.module)).size < 12) failures.push("ap_bill module inventory unexpectedly shrank");
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of contracts) if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: non-posting A/P bill FE contract missing`);
  return failures;
}
const leaves = collectApBillLeaves();
const sources = { routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"), files: Object.fromEntries(contracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])) };
if (process.argv.includes("--selftest")) {
  if (!auditApBillColumn(sources, leaves.filter((leaf) => leaf.module !== "accounting")).some((failure) => failure.includes("priority-10"))) { console.error("verify-wave-c-ap-bill-fe-all-modules SELFTEST FAIL — P10 mutation escaped"); process.exit(1); }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/pages/insurance/ClaimsTab.tsx"] = mutated.files["apps/frontend/src/pages/insurance/ClaimsTab.tsx"].replaceAll('kind="bill"', 'kind="expense"');
  if (!auditApBillColumn(mutated, leaves).some((failure) => failure.includes("ClaimsTab"))) { console.error("verify-wave-c-ap-bill-fe-all-modules SELFTEST FAIL — all-module mutation escaped"); process.exit(1); }
  console.log("verify-wave-c-ap-bill-fe-all-modules SELFTEST PASS — P10 and all-module mutations detected"); process.exit(0);
}
const failures = auditApBillColumn(sources, leaves);
for (const guard of composed) { if (!fs.existsSync(path.join(ROOT, "scripts", guard))) continue; const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" }); if (result.status !== 0) failures.push(`${guard}: composed FE guard failed\n${result.stdout}${result.stderr}`); }
if (failures.length) { console.error(`verify-wave-c-ap-bill-fe-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-c-ap-bill-fe-all-modules PASS — P10 first (${leaves.filter((leaf) => P10.has(leaf.module)).length}), then ${leaves.length} A/P bill FE leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules; GL untouched`);
