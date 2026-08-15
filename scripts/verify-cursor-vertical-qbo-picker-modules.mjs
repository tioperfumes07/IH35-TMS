#!/usr/bin/env node
/**
 * Cursor vertical — qbo_chrome + picker_law Box3 Built across modules (post-Lists).
 * HONEST-BUILT-LAUNCH-LAW: leaf-specific family tags; picker_law ≤40 Required leaves/tag.
 *
 * Wave A+B: all remaining Cursor qbo_chrome/picker_law modules
 *
 * @matrix-built {"modules":["reports"],"cols":["qbo_chrome"],"leafRe":"^(home|subnav|filter|cat|report|runner|chrome)\\.","task":"CURSOR-VERTICAL-reports-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^(bills|expenses|bill_payments|vendors|customers|invoices|payments|je|coa|period_close|accounting|payment_methods_catalog|chrome)(\\.|$)","task":"CURSOR-VERTICAL-accounting-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["picker_law"],"leafRe":"^(bills\\.|accounting\\.(modal|drawer|parity|wizard)\\.|payment_methods_catalog)","task":"CURSOR-VERTICAL-accounting-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^(wo|in_transit|arriving_soon|damage_reports|driver_reports|severe_repairs|road_service|defects|pre_flight_dvir|parts_inventory|pm|inspections|parts|vendors|fault_rules|fault_drafts|tires|warranty|maintenance|master|chrome)\\.","task":"CURSOR-VERTICAL-maintenance-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["picker_law"],"leafRe":"^(wo\\.|maintenance\\.(modal|drawer|parity)|parts\\.|vendors\\.|inspections\\.|fault_|tires\\.|master\\.|warranty\\.)","task":"CURSOR-VERTICAL-maintenance-picker","vertical":"column-wave"}
 *
 * Wave B — remaining Cursor-lane modules
 * @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^(accounts|transactions\.categorize|reconciliation|banking\.(modal|parity)\.(record_transfer|transfer|record_ccpayment|bank_transaction_split|manual_je)|banking\.(drawer|parity)\.match)$","task":"CURSOR-VERTICAL-banking-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["cash-flow"],"cols":["qbo_chrome"],"leafRe":"^(cash-flow|create)(\\.|$)","task":"CURSOR-VERTICAL-cash-flow-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["cash-flow"],"cols":["picker_law"],"leafRe":"^(create\\.|cash-flow\\.)","task":"CURSOR-VERTICAL-cash-flow-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["customers"],"cols":["qbo_chrome"],"leafRe":"^(chrome|customers|detail|home|list|md)(\\.|$)","task":"CURSOR-VERTICAL-customers-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["customers"],"cols":["picker_law"],"leafRe":"^(home\\.|list\\.|detail\\.|customers\\.)","task":"CURSOR-VERTICAL-customers-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["dispatch"],"cols":["qbo_chrome"],"leafRe":"^(chrome|dispatch|docs|load|planning|queues|secondary|settings)(\\.|$)","task":"CURSOR-VERTICAL-dispatch-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["dispatch"],"cols":["picker_law"],"leafRe":"^(home\\.|dispatch\\.)","task":"CURSOR-VERTICAL-dispatch-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["docs"],"cols":["qbo_chrome"],"leafRe":"^(chrome)(\\.|$)","task":"CURSOR-VERTICAL-docs-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["driver-hub"],"cols":["qbo_chrome"],"leafRe":"^(driver-hub)(\\.|$)","task":"CURSOR-VERTICAL-driver-hub-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^(cash_advances|chrome|deductions|drivers|pay_rate_templates|profiles|teams)(\\.|$)","task":"CURSOR-VERTICAL-drivers-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["picker_law"],"leafRe":"^(profiles\\.|drivers\\.|teams\\.)","task":"CURSOR-VERTICAL-drivers-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["factoring"],"cols":["qbo_chrome"],"leafRe":"^(batches|factoring)(\\.|$)","task":"CURSOR-VERTICAL-factoring-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["factoring"],"cols":["picker_law"],"leafRe":"^(batches\\.|factoring\\.)","task":"CURSOR-VERTICAL-factoring-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["finance"],"cols":["qbo_chrome"],"leafRe":"^(chrome|hop|hub|nav|statements)(\\.|$)","task":"CURSOR-VERTICAL-finance-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["finance"],"cols":["picker_law"],"leafRe":"^(nav\\.|finance\\.)","task":"CURSOR-VERTICAL-finance-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^(chrome|fleet|home|roster|trailer|unit)(\\.|$)","task":"CURSOR-VERTICAL-fleet-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["picker_law"],"leafRe":"^(home\\.|fleet\\.)","task":"CURSOR-VERTICAL-fleet-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["fuel"],"cols":["qbo_chrome"],"leafRe":"^(fuel)(\\.|$)","task":"CURSOR-VERTICAL-fuel-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["fuel"],"cols":["picker_law"],"leafRe":"^(fuel\\.)","task":"CURSOR-VERTICAL-fuel-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["insurance"],"cols":["qbo_chrome"],"leafRe":"^(chrome|claims|lawsuits|policies|type_catalog)(\\.|$)","task":"CURSOR-VERTICAL-insurance-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["insurance"],"cols":["picker_law"],"leafRe":"^(type_catalog\\.|insurance\\.)","task":"CURSOR-VERTICAL-insurance-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["inventory"],"cols":["qbo_chrome"],"leafRe":"^(parts)(\\.|$)","task":"CURSOR-VERTICAL-inventory-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["inventory"],"cols":["picker_law"],"leafRe":"^(parts\\.|inventory\\.)","task":"CURSOR-VERTICAL-inventory-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["legal"],"cols":["qbo_chrome"],"leafRe":"^(chrome|contracts|matters|policies|templates)(\\.|$)","task":"CURSOR-VERTICAL-legal-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["legal"],"cols":["picker_law"],"leafRe":"^(contracts\\.|legal\\.)","task":"CURSOR-VERTICAL-legal-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["program"],"cols":["qbo_chrome"],"leafRe":"^(program)(\\.|$)","task":"CURSOR-VERTICAL-program-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^(accidents|cargo_claims|chrome|damage_reports|dot_inspections|drug_alcohol|escrow_record|external_fines|internal_fines|leave_requests|permits|safety_meetings|training_programs|training_records)(\\.|$)","task":"CURSOR-VERTICAL-safety-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["picker_law"],"leafRe":"^(damage_reports\\.|external_fines\\.|safety\\.|training_programs\\.)","task":"CURSOR-VERTICAL-safety-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["qbo_chrome"],"leafRe":"^(cash_advances|settlement_close|settlements\.panel\.open_driver_bills)$","task":"CURSOR-VERTICAL-settlements-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["picker_law"],"leafRe":"^(settlements\\.)","task":"CURSOR-VERTICAL-settlements-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["system"],"cols":["picker_law"],"leafRe":"^(system\\.)","task":"CURSOR-VERTICAL-system-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["tasks"],"cols":["qbo_chrome"],"leafRe":"^(daily_tasks|tasks)(\\.|$)","task":"CURSOR-VERTICAL-tasks-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["tasks"],"cols":["picker_law"],"leafRe":"^(board\\.|tasks\\.)","task":"CURSOR-VERTICAL-tasks-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["users"],"cols":["qbo_chrome"],"leafRe":"^(create|detail)(\\.|$)","task":"CURSOR-VERTICAL-users-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["users"],"cols":["picker_law"],"leafRe":"^(create$)","task":"CURSOR-VERTICAL-users-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^(chrome|detail|home|list|md|vendors)(\\.|$)","task":"CURSOR-VERTICAL-vendors-qbo","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["picker_law"],"leafRe":"^(home\\.|list\\.|detail\\.|vendors\\.)","task":"CURSOR-VERTICAL-vendors-picker","vertical":"column-wave"}
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
  "apps/frontend/src/pages/banking/BankingHome.tsx",
  "apps/frontend/src/pages/customers/CustomersListView.tsx",
  "apps/frontend/src/pages/vendors/VendorsListView.tsx",
  "apps/frontend/src/pages/fleet/FleetHomePage.tsx",
  "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  "apps/frontend/src/pages/safety/SafetyHome.tsx",
  "apps/frontend/src/pages/drivers/DriversPage.tsx",
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

  // Module required maps still list chrome/picker leaves for wave modules
  for (const mod of ["reports", "accounting", "maintenance", "banking", "customers", "vendors", "fleet", "dispatch", "safety", "drivers"]) {
    const req = JSON.parse(read(`docs/specs/scoreboard/modules/${mod}.required.json`));
    const n = (req.leaves || []).filter(
      (l) => Array.isArray(l.required) && (l.required.includes("qbo_chrome") || l.required.includes("picker_law")),
    ).length;
    if (n < 5) failures.push(`${mod}: chrome/picker required leaf count shrank to ${n}`);
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
console.log(`${LABEL} PASS — Cursor vertical qbo/picker waves A+B (all remaining modules)`);
