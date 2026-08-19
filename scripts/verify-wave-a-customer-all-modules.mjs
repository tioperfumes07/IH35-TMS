#!/usr/bin/env node
/** Full-product customer FK contract across every module that genuinely owns it.
 *
 * LINK-F5165 (2026-08-14): same self-regression pattern already documented and fixed for ap_bill
 * (ACCT-F5162) and trailer (LINK-F5163) — the fixed floors below (`p10.length < 177`,
 * `leaves.length < 262`, module-Set size `< 16`) could not tell honest correction from real loss.
 * The vertical customer-column sweep went leaf-by-leaf with live code evidence across all 17
 * modules that ever flagged customer (278 leaves total) and honestly removed 183 false Required
 * markings — cash-flow, fleet, and insurance dropped to zero genuine customer leaves and correctly
 * left the module set (home.role.dispatcher was initially miscounted false too — DispatcherHome.tsx's
 * own text has no "customer" hits, but it unconditionally mounts DispatcherActiveLoadsPanel.tsx,
 * which does; corrected before shipping, home KEEPS one leaf); the honest count dropped from 262+ to
 * 95 across 14 modules. Floors removed, replaced with the same per-leaf auditConnectivity + unchanged
 * file-pattern/composed-guard checks pattern used in the ap_bill and trailer fixes. Module list
 * corrected to the honest 14 that still own customer leaves. This aggregate census deliberately
 * carries no @matrix-built credit: route presence plus a handful of representative contracts does
 * not prove every customer leaf. Exact child guards own leaf-specific Built credit. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
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
  // Independently converged fix — CLS-SILENT-CAP replaced the ReferenceSelect createKind="customer"
  // + capped local listCustomers roster with the canonical EntityPicker (real server-search, no
  // cap); accepts either contract. See verify-contract-creator-customer-search.mjs for the
  // detailed check of this same surface.
  [
    "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
    /createKind="customer"|<EntityPicker[\s\S]{0,500}kind="customer"[\s\S]{0,500}allowCreate/,
  ],
  ["apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx", /customer_id:\s*values\.customer_id \|\| undefined/],
  // Direct inline EntityLink OR the extracted ManagementCustomerCell component (honest-label +
  // tombstone handling, internally wires kind="customer" id={customerId} — see its own
  // definition) called with customerId={row.customer_id}. Both wire the same FK. Two lookaheads
  // (call site + component definition) so both must be true, not just one in isolation.
  [
    "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
    /<EntityLink kind="customer" id=\{row\.customer_id\}|(?=[\s\S]*<ManagementCustomerCell customerId=\{row\.customer_id\})(?=[\s\S]*function ManagementCustomerCell[\s\S]{0,600}kind="customer" id=\{customerId\})/,
  ],
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
  if (leaves.length === 0) failures.push("customer inventory is empty — no module claims customer at all");
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
  if (!auditCustomerColumn(sources, []).some((failure) => failure.includes("empty"))) {
    console.error("verify-wave-a-customer-all-modules SELFTEST FAIL — empty-inventory mutation escaped"); process.exit(1);
  }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/pages/finance/ArApAgingPage.tsx"] = mutated.files["apps/frontend/src/pages/finance/ArApAgingPage.tsx"].replace('kind="customer"', 'kind="vendor"');
  if (!auditCustomerColumn(mutated, leaves).some((failure) => failure.includes("ArApAgingPage"))) {
    console.error("verify-wave-a-customer-all-modules SELFTEST FAIL — contract mutation escaped"); process.exit(1);
  }
  console.log("verify-wave-a-customer-all-modules SELFTEST PASS — empty-inventory and contract mutations detected"); process.exit(0);
}
const failures = auditCustomerColumn(sources, leaves);
for (const guard of composed) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${guard}: composed guard failed\n${result.stdout}${result.stderr}`);
}
if (failures.length) { console.error(`verify-wave-a-customer-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-a-customer-all-modules PASS — ${leaves.length} customer leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules, every one route/surface-verified`);
