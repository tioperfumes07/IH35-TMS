#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["expense"],"leafRe":"^accounting\\.parity\\.(expense_create_page|expenses_list_page)$","task":"WAVE-C-expense-accounting-parity","vertical":"column-wave"} */
/** @matrix-built {"modules":["home"],"cols":["expense"],"leafRe":"^role\\.accountant$","task":"WAVE-C-expense-home-record","vertical":"column-wave"} */
/** @matrix-built {"modules":["insurance"],"cols":["expense"],"leafRe":"^claims\\.create$","task":"WAVE-C-expense-insurance-claim","vertical":"column-wave"} */
/** @matrix-built {"modules":["maintenance"],"cols":["expense"],"leafRe":"^maintenance\\.modal\\.create_expense$","task":"WAVE-C-expense-maintenance-create","vertical":"column-wave"} */
/** @matrix-built {"modules":["fuel"],"cols":["expense"],"leafRe":"^expense_mapping$","task":"WAVE-C-expense-fuel-mapping","vertical":"column-wave"} */
/** @matrix-built {"modules":["reports"],"cols":["expense"],"leafRe":"^report\\.management$","task":"WAVE-C-expense-management-report","vertical":"column-wave"} */
/** Non-posting expense FE contract. This guard never validates or changes GL math. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const P10 = new Set(["lists", "accounting", "dispatch", "settlements", "factoring", "banking", "customers", "vendors", "drivers", "safety"]);
const ROUTES = ["apps/frontend/src/routes/manifest.tsx", "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];
export function collectExpenseLeaves(read = fs.readFileSync, readDir = fs.readdirSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) if ((leaf.required || []).includes("expense")) leaves.push({ module: spec.module, id: leaf.id, route: leaf.route_hint });
  }
  return leaves;
}
const contracts = [
  ["apps/frontend/src/pages/accounting/ExpensesListPage.tsx", /label: "Vendor"[\s\S]*kind="vendor"[\s\S]*label: "JE"[\s\S]*kind="journal_entry"/],
  ["apps/frontend/src/pages/accounting/MaintenanceShopHubPage.tsx", /<EntityLink kind="expense" id=\{row\.financial_id\}/],
  ["apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx", /<EntityLink kind="expense" id=\{tx\.matched_expense_id\}/],
  ["apps/frontend/src/pages/home/QuickActionsBar.tsx", /<RecordExpenseModal/],
  ["apps/frontend/src/pages/insurance/ClaimsTab.tsx", /kind="expense"/],
  ["apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", /<CreateExpenseModal/],
  ["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", /to="\/accounting\/settings\/expense-category-map"/],
  ["apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx", /Expenses by Vendor Summary/],
  ["apps/frontend/src/components/expenses/RecordExpenseForm.tsx", /data-testid="record-expense-form"/],
];
const composed = [
  "verify-expense-column-wave.mjs", "verify-acct-expense-list-reverse.mjs", "verify-expense-bank-reverse-links.mjs",
  "verify-home-record-expense-modal.mjs", "verify-maint-home-bill-expense-wo-link.mjs", "verify-insurance-claim-linkage.mjs",
  "verify-expense-create-modal-catalog.mjs", "verify-expense-category-picker-canonical.mjs", "verify-unit-linked-expense-human-labels.mjs",
  "verify-wo-linked-expense-human-labels.mjs", "verify-expenses-canonical-route-is-list.mjs",
];
export function auditExpenseColumn(sources, leaves) {
  const failures = [];
  const p10 = leaves.filter((leaf) => P10.has(leaf.module));
  // ACCT-F5083 removed four proven-false P10 cells (Book/Reserve/Detention/Relay); 13 was the
  // honest floor at the time.
  // LINK-F5189 (2026-08-15, CC-1): a full 3-agent read-only re-investigation of every leaf then
  // Required for expense (36 total) found this floor had gone stale -- prior legitimate
  // honesty_audit corrections (expense_2026_08_13_secondary, dated BEFORE this floor was last
  // set: 6 inventory + 4 maintenance + 17 reports leaves) had already dropped the true count to
  // 36 with no floor update, and this session's own re-investigation found 15 MORE genuinely
  // false-required leaves (6 accounting: bills.create.vendor/trk_bulk_register/detail/
  // class_cost_center_variance/schedule/modal.create -- all either GL-account-only postings with
  // no accounting.expenses row, or a prepaid-asset/fixed-asset create with no expense angle;
  // 1 maintenance: wo.source.rs, a bill-only road-service flow; 8 more across cash-flow/fuel/
  // home/insurance/reports/safety/vendors, each a rollup, category picker, vendor-attribute
  // editor, or create-form with no single owning expense record -- each with a live-verified
  // "no INSERT INTO accounting.expenses in this flow" citation in
  // docs/specs/scoreboard/modules/*.required.json honesty_audit.expense_2026_08_15). 10 genuine
  // gaps were also found and BUILT (not dropped) in the same sweep. Verified live 2026-08-15:
  // p10=9, total=21, module diversity=5 -- all three floors below reset to those exact honest
  // counts, same convention as the ACCT-F5083/F5085/F5086 corrections above.
  if (p10.length < 9) failures.push(`priority-10 expense inventory unexpectedly shrank to ${p10.length}`);
  if (leaves.length < 21) failures.push(`all-module expense inventory unexpectedly shrank to ${leaves.length}`);
  if (new Set(leaves.map((leaf) => leaf.module)).size < 5) failures.push("expense module inventory unexpectedly shrank");
  failures.push(...auditConnectivity(sources.routes, leaves, 0));
  for (const [file, pattern] of contracts) if (!pattern.test(sources.files[file] || "")) failures.push(`${file}: non-posting expense FE contract missing`);
  return failures;
}
const leaves = collectExpenseLeaves();
const sources = { routes: ROUTES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"), files: Object.fromEntries(contracts.map(([file]) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])) };
if (process.argv.includes("--selftest")) {
  if (!auditExpenseColumn(sources, leaves.filter((leaf) => leaf.module !== "accounting")).some((failure) => failure.includes("priority-10"))) { console.error("verify-wave-c-expense-fe-all-modules SELFTEST FAIL — P10 mutation escaped"); process.exit(1); }
  const mutated = structuredClone(sources);
  mutated.files["apps/frontend/src/pages/insurance/ClaimsTab.tsx"] = mutated.files["apps/frontend/src/pages/insurance/ClaimsTab.tsx"].replaceAll('kind="expense"', 'kind="bill"');
  if (!auditExpenseColumn(mutated, leaves).some((failure) => failure.includes("ClaimsTab"))) { console.error("verify-wave-c-expense-fe-all-modules SELFTEST FAIL — all-module mutation escaped"); process.exit(1); }
  console.log("verify-wave-c-expense-fe-all-modules SELFTEST PASS — P10 and all-module mutations detected"); process.exit(0);
}
const failures = auditExpenseColumn(sources, leaves);
for (const guard of composed) { if (!fs.existsSync(path.join(ROOT, "scripts", guard))) continue; const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", guard)], { encoding: "utf8" }); if (result.status !== 0) failures.push(`${guard}: composed FE guard failed\n${result.stdout}${result.stderr}`); }
if (failures.length) { console.error(`verify-wave-c-expense-fe-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log(`verify-wave-c-expense-fe-all-modules PASS — P10 first (${leaves.filter((leaf) => P10.has(leaf.module)).length}), then ${leaves.length} expense FE leaves across ${new Set(leaves.map((leaf) => leaf.module)).size} modules; GL untouched`);
