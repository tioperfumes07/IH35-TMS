#!/usr/bin/env node
/** Full-product liability navigation/surface contract. No liability recognition or GL math lives here. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const P10 = new Set(["lists", "accounting", "dispatch", "settlements", "factoring", "banking", "customers", "vendors", "drivers", "safety"]);
const ROUTES = ["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];
export function collectLiabilityLeaves(read = fs.readFileSync, readDir = fs.readdirSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) if ((leaf.required || []).includes("liability")) leaves.push({ module: spec.module, id: leaf.id, route: leaf.route_hint });
  }
  return leaves;
}
const contracts = [
  ["apps/frontend/src/components/drivers/EarningsTab.tsx", /<EntityLink[\s\S]*kind="liability"/],
  ["apps/frontend/src/pages/safety/InternalFinesPage.tsx", /<EntityLink kind="liability"/],
  ["apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx", /<EntityLink kind="liability" id=\{entry\.linked_liability_id\}/],
  ["apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx", /<EntityLink kind="liability" id=\{item\.id\}/],
  ["apps/frontend/src/pages/driver-finance/SettlementsPage.tsx", /to: "\/liabilities"/],
  ["apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx", /Total Liabilities & Equity/],
  ["apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx", /liabilityAccountId/],
];
const composed = [
  "verify-liability-column-wave.mjs", "verify-settlements-liability-forward-link.mjs", "verify-liability-surfaces-built.mjs",
  "verify-banking-factoring-liability-built.mjs", "verify-wave-c-liability-factoring-leaves.mjs", "verify-wave-c-liability-fleet-insurance.mjs",
  "verify-wave-c-liability-insurance-legal.mjs", "verify-factoring-liability-reserve-column.mjs", "verify-liability-chrome-honest-2.mjs",
];
export function auditLiabilityColumn(sources, leaves) {
  const failures = [];
  const p10 = leaves.filter((leaf) => P10.has(leaf.module));
  // LINK-F5187 (2026-08-15, CC-1): a full-repo liability Required-column honesty sweep
  // (cluster A + cluster B, PRs #6970/#6976/#6987) legitimately dropped the honest inventory
  // from these stale floors (32/80/13) to 25/26/7 -- each drop individually verified against
  // live code (no fabricated EntityLink kind="liability" for the leaf's actual record) and
  // documented in the relevant required.json's honesty_audit['liability_2026_08_15*']
  // entries. This guard's floor was never updated to match; reset here to the exact verified
  // honest counts, same convention as the ACCT-F5083-style corrections on the sibling
  // expense/ap_bill inventory guards this session.
  if (p10.length < 25) failures.push(`priority-10 liability inventory unexpectedly shrank to ${p10.length}`);
  if (leaves.length < 26) failures.push(`all-module liability inventory unexpectedly shrank to ${leaves.length}`);
  if (new Set(leaves.map((leaf) => leaf.module)).size < 7) failures.push("liability module inventory unexpectedly shrank");
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of contracts) if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: liability FE navigation/surface contract missing`);
  return failures;
}
const leaves = collectLiabilityLeaves();
const sources = { routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"), files: Object.fromEntries(contracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])) };
if (process.argv.includes("--selftest")) {
  const p10Shrunk = [...leaves.filter((leaf) => !P10.has(leaf.module)), ...leaves.filter((leaf) => P10.has(leaf.module)).slice(0, 24)];
  if (!auditLiabilityColumn(sources, p10Shrunk).some((failure) => failure.includes("priority-10"))) { console.error("verify-wave-c-liability-fe-all-modules SELFTEST FAIL — P10 mutation escaped"); process.exit(1); }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx"] = mutated.files["apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx"].replaceAll('kind="liability"', 'kind="expense"');
  if (!auditLiabilityColumn(mutated, leaves).some((failure) => failure.includes("LiabilityBreakdownModal"))) { console.error("verify-wave-c-liability-fe-all-modules SELFTEST FAIL — all-module mutation escaped"); process.exit(1); }
  console.log("verify-wave-c-liability-fe-all-modules SELFTEST PASS — P10 and all-module mutations detected"); process.exit(0);
}
const failures = auditLiabilityColumn(sources, leaves);
for (const guard of composed) { if (!fs.existsSync(path.join(ROOT, "scripts", guard))) continue; const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" }); if (result.status !== 0) failures.push(`${guard}: composed liability guard failed\n${result.stdout}${result.stderr}`); }
if (failures.length) { console.error(`verify-wave-c-liability-fe-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-c-liability-fe-all-modules PASS — P10 first (${leaves.filter((leaf) => P10.has(leaf.module)).length}), then ${leaves.length} liability FE leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules; posting math untouched`);
