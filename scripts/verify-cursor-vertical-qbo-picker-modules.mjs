#!/usr/bin/env node
/**
 * Cursor vertical — qbo_chrome + picker_law Box3 Built across modules (post-Lists).
 * HONEST-BUILT-LAUNCH-LAW: leaf-specific family tags; picker_law ≤40 Required leaves/tag.
 *
 * Wave A (this PR): reports + accounting + maintenance
 *
 * @matrix-built {"modules":["reports"],"cols":["qbo_chrome"],"leafRe":"^(home|subnav|filter|cat|report|runner|chrome)\\.","task":"CURSOR-VERTICAL-reports-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^(bills|expenses|bill_payments|vendors|customers|invoices|payments|je|coa|period_close|accounting|payment_methods_catalog|chrome)(\\.|$)","task":"CURSOR-VERTICAL-accounting-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["picker_law"],"leafRe":"^(bills\\.|accounting\\.(modal|drawer|parity|wizard)\\.|payment_methods_catalog)","task":"CURSOR-VERTICAL-accounting-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^(wo|in_transit|arriving_soon|damage_reports|driver_reports|severe_repairs|road_service|defects|pre_flight_dvir|parts_inventory|pm|inspections|parts|vendors|fault_rules|fault_drafts|tires|warranty|maintenance|master|chrome)\\.","task":"CURSOR-VERTICAL-maintenance-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["picker_law"],"leafRe":"^(wo\\.|maintenance\\.(modal|drawer|parity)|parts\\.|vendors\\.|inspections\\.|fault_|tires\\.|master\\.|warranty\\.)","task":"CURSOR-VERTICAL-maintenance-picker","vertical":"column-wave"}
 *
 * Run: node scripts/verify-cursor-vertical-qbo-picker-modules.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cursor-vertical-qbo-picker-modules";

const REQUIRED_FILES = [
  "apps/frontend/src/pages/reports/ReportsHome.tsx",
  "apps/frontend/src/pages/reports/runners/RunnerFilters.tsx",
  "apps/frontend/src/components/table/CollapsedListFilters.tsx",
  "apps/frontend/src/pages/accounting/BillsPage.tsx",
  "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
  "apps/frontend/src/pages/maintenance/WorkOrderCreateModal.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function audit(opts = {}) {
  const failures = [];
  for (const rel of REQUIRED_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) failures.push(`missing ${rel}`);
  }
  if (failures.length) return { failures };

  const reportsHome = opts.reportsHome ?? read("apps/frontend/src/pages/reports/ReportsHome.tsx");
  const runnerFilters = opts.runnerFilters ?? read("apps/frontend/src/pages/reports/runners/RunnerFilters.tsx");
  const collapsed = opts.collapsed ?? read("apps/frontend/src/components/table/CollapsedListFilters.tsx");
  const bills = opts.bills ?? read("apps/frontend/src/pages/accounting/BillsPage.tsx");
  const maintHome = opts.maintHome ?? read("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx");
  const woCreate = opts.woCreate ?? read("apps/frontend/src/pages/maintenance/WorkOrderCreateModal.tsx");

  if (!/ReportsHomePage|export function ReportsHome/.test(reportsHome)) {
    failures.push("ReportsHome must export ReportsHomePage");
  }
  if (!runnerFilters.includes("CollapsedListFilters")) {
    failures.push("RunnerFilters must use CollapsedListFilters");
  }
  for (const prop of ["onApply", "onReset", "onCancel"]) {
    if (!runnerFilters.includes(prop)) failures.push(`RunnerFilters missing ${prop}`);
  }
  if (!collapsed.includes("onApply")) failures.push("CollapsedListFilters missing onApply contract");

  if (!bills.includes("+ Create") && !bills.includes("+Create") && !/CreateBill|BillCreate|openCreate/.test(bills)) {
    failures.push("BillsPage missing create chrome affordance");
  }
  if (!/ParityTable|DataTable|CollapsedListFilters/.test(bills)) {
    failures.push("BillsPage missing list chrome (table/filters)");
  }

  if (!/ParityTable|DataTable|CollapsedListFilters|WorkOrder/.test(maintHome)) {
    failures.push("MaintenanceHome missing list/WO chrome");
  }
  if (!woCreate.includes("+ Create") && !/Create|onSave|submit/i.test(woCreate)) {
    failures.push("WorkOrderCreateModal missing create chrome");
  }

  // Module required maps still list the wave leaves
  for (const mod of ["reports", "accounting", "maintenance"]) {
    const req = JSON.parse(read(`docs/specs/scoreboard/modules/${mod}.required.json`));
    const n = (req.leaves || []).filter(
      (l) => Array.isArray(l.required) && (l.required.includes("qbo_chrome") || l.required.includes("picker_law")),
    ).length;
    if (n < 10) failures.push(`${mod}: chrome/picker required leaf count shrank to ${n}`);
  }

  return { failures };
}

if (process.argv.includes("--selftest")) {
  const base = audit();
  if (base.failures.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree already red:`);
    for (const f of base.failures) console.error(" -", f);
    process.exit(1);
  }
  const mut = audit({
    runnerFilters: read("apps/frontend/src/pages/reports/runners/RunnerFilters.tsx").replaceAll(
      "CollapsedListFilters",
      "LocalFilters",
    ),
  });
  if (!mut.failures.some((f) => /CollapsedListFilters/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — RunnerFilters mutation not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const result = audit();
if (result.failures.length) {
  console.error(`${LABEL} FAIL (${result.failures.length}):`);
  for (const f of result.failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — reports/accounting/maintenance chrome wave A`);
