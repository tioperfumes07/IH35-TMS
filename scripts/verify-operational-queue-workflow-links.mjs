#!/usr/bin/env node
/** @matrix-built {"modules":["banking","factoring","reports"],"cols":["reverse_link"],"leafRe":"^(reconciliation|factoring|driver_escrow|submit\.queue|batches\.create|factors\.admin|faro\.import|accounting\.(list|detail|factor_recon)|banking\.entry|factoring\.wizard\.batch|report\.(management|per_truck_cpm|fuel_reconciliation|dispatch_margin|geofence_dwell))$","task":"LINK-F5150-OPERATIONAL-QUEUE-WORKFLOW-LINKS","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  banking: "apps/frontend/src/pages/banking/BankingHome.tsx",
  submit: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx",
  wizard: "apps/frontend/src/pages/factoring/BatchWizard.tsx",
  factors: "apps/frontend/src/pages/factoring/FactorAdmin.tsx",
  faro: "apps/frontend/src/pages/factoring/FaroImportPage.tsx",
  factorList: "apps/frontend/src/pages/accounting/FactoringListPage.tsx",
  factorDetail: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
  factorRecon: "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx",
  management: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
  cpm: "apps/frontend/src/pages/reports/PerTruckCpmReport.tsx",
  fuel: "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx",
  margin: "apps/frontend/src/pages/reports/DispatchMarginPage.tsx",
  dwell: "apps/frontend/src/pages/reports/GeofenceDwellReport.tsx",
};

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

export function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("banking", "navigate(BANKING_TAB_PATH.reconciliation)", "banking reconciliation queue must stay mounted");
  need("banking", 'navigate("/factoring/reserve-tracker")', "banking factoring workflow must drill to reserves");
  need("banking", "navigate(BANKING_TAB_PATH.driver_escrow)", "banking driver escrow workflow must stay mounted");
  need("submit", 'kind="invoice"', "factoring submission queue must drill to invoices");
  need("submit", 'kind="customer"', "factoring submission queue must drill to customers");
  need("wizard", 'kind="invoice"', "factoring batch wizard must drill to selected invoices");
  need("factors", '<EntityLink kind="factoring_batch" id={row.id} label={entityLabel(row.batch_number, row.id, "Batch")} />', "factor admin must drill each row to its canonical batch id with a human batch label");
  need("faro", 'kind="customer"', "Faro import must drill to canonical customers");
  need("factorList", 'kind="factoring_advance"', "accounting factoring list must drill to advances");
  need("factorDetail", 'kind="invoice"', "accounting factoring detail must drill to invoices");
  need("factorRecon", 'kind="invoice"', "factor reconciliation must drill to invoices");
  need("management", 'kind="customer"', "management report must drill to customers");
  need("management", 'kind="vendor"', "management report must drill to vendors");
  need("cpm", 'kind="unit"', "per-truck CPM must drill to units");
  need("fuel", 'kind="unit"', "fuel reconciliation must drill to units");
  need("margin", 'kind="load"', "dispatch margin must drill to loads");
  need("margin", 'kind="customer"', "dispatch margin must drill to customers");
  need("dwell", 'kind="driver"', "geofence dwell must drill to drivers");
  need("dwell", 'kind="unit"', "geofence dwell must drill to units");
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("operational queue/workflow reverse-link guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
if (process.argv.includes("--self-test")) {
  const mutations = [
    ["banking", "navigate(BANKING_TAB_PATH.reconciliation)", "navigate('/banking')"],
    ["banking", 'navigate("/factoring/reserve-tracker")', "navigate('/factoring')"],
    ["banking", "navigate(BANKING_TAB_PATH.driver_escrow)", "navigate('/banking')"],
    ["submit", 'kind="invoice"', 'kind="load"'],
    ["submit", 'kind="customer"', 'kind="vendor"'],
    ["wizard", 'kind="invoice"', 'kind="load"'],
    ["factors", '<EntityLink kind="factoring_batch" id={row.id} label={entityLabel(row.batch_number, row.id, "Batch")} />', '<EntityLink kind="factoring_batch" id={row.customer_id} label={entityLabel(undefined, row.customer_id, "Batch")} />'],
    ["faro", 'kind="customer"', 'kind="vendor"'],
    ["factorList", 'kind="factoring_advance"', 'kind="invoice"'],
    ["factorDetail", 'kind="invoice"', 'kind="load"'],
    ["factorRecon", 'kind="invoice"', 'kind="load"'],
    ["management", 'kind="customer"', 'kind="driver"'],
    ["management", 'kind="vendor"', 'kind="driver"'],
    ["cpm", 'kind="unit"', 'kind="driver"'],
    ["fuel", 'kind="unit"', 'kind="driver"'],
    ["margin", 'kind="load"', 'kind="unit"'],
    ["margin", 'kind="customer"', 'kind="vendor"'],
    ["dwell", 'kind="driver"', 'kind="customer"'],
    ["dwell", 'kind="unit"', 'kind="customer"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}
console.log("PASS: operational queues/workflows drill through across Banking, Factoring, and Reports");
