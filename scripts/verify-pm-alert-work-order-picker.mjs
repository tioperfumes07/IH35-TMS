#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","fleet"],"cols":["work_order","unit","picker_law","connectivity","reverse_link"],"leafRe":"^(maintenance\\.panel\\.pm_alerts|unit\\.profile\\.maintenance)$","task":"PM-ALERT-WO-PICKER","vertical":"column-wave"} */

import fs from "node:fs";

const sources = {
  ui: fs.readFileSync("apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  route: fs.readFileSync("apps/backend/src/maintenance/pm-alerts.routes.ts", "utf8"),
};

const checks = [
  ["ui", /kind="work_order"[\s\S]*operatingCompanyId=\{operatingCompanyId\}/, "PM alert uses scoped canonical WO picker"],
  ["ui", /value=\{selectedWorkOrderId\}[\s\S]*onChange=\{setSelectedWorkOrderId\}/, "WO picker selection is controlled"],
  ["ui", /scheduleMutation\.mutate\(\{[\s\S]*alertId: alert\.id,[\s\S]*workOrderId: selectedWorkOrderId,[\s\S]*companyId: operatingCompanyId,[\s\S]*generation: actionGenerationRef\.current/, "selected WO reaches immutable mutation payload"],
  ["ui", /kind="unit" id=\{alert\.unit_id\}/, "PM alert unit drills canonically"],
  ["ui", /setSchedulingAlertId\(null\)[\s\S]*setSelectedWorkOrderId\(null\)/, "success/cancel clears picker state"],
  ["ui", /disabled=\{!selectedWorkOrderId \|\| scheduleMutation\.isPending\}/, "Apply rejects empty selection and duplicate submit"],
  ["ui", /Could not link work order to PM alert/, "mutation failure is visible"],
  ["ui", { absent: /window\.prompt\([^)]*work order/i }, "raw UUID prompt is absent"],
  ["api", /operating_company_id: companyId, work_order_id: workOrderId/, "API sends company and selected WO"],
  ["route", /FROM maintenance\.pm_alerts[\s\S]*operating_company_id = \$2::uuid[\s\S]*FOR UPDATE/, "backend locks company-owned alert"],
  ["route", /FROM maintenance\.work_orders[\s\S]*operating_company_id = \$2::uuid/, "backend validates company-owned WO"],
  ["route", /work_order_not_found_for_company/, "foreign-company or missing WO fails closed"],
  ["route", /work_order_unit_mismatch/, "WO must match alert unit"],
  ["route", /scheduled_work_order_id = \$3::uuid/, "canonical WO FK persists"],
  ["route", /maintenance\.pm_alert\.scheduled[\s\S]*scheduled_work_order_id: body\.data\.work_order_id/, "audit records selected WO"],
];

const failures = (candidate) => checks.flatMap(([key, expectation, label]) => {
  if (expectation instanceof RegExp) return expectation.test(candidate[key]) ? [] : [label];
  return expectation.absent.test(candidate[key]) ? [label] : [];
});

const found = failures(sources);
if (found.length) {
  console.error(`verify-pm-alert-work-order-picker: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, expectation, label] of checks) {
    const mutant = { ...sources };
    mutant[key] = expectation instanceof RegExp
      ? sources[key].replace(new RegExp(expectation.source, `${expectation.flags}g`), "/* planted defect */")
      : `${sources[key]}\nwindow.prompt("Enter work order ID")`;
    if (!failures(mutant).includes(label)) {
      console.error(`verify-pm-alert-work-order-picker: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-pm-alert-work-order-picker: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-pm-alert-work-order-picker: PASS — ${checks.length} PM alert/WO invariants`);
