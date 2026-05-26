#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_MAINT_REPORTS_ROOT ?? process.cwd();
const backendPath =
  process.env.VERIFY_MAINT_REPORTS_BACKEND_PATH ??
  path.join(ROOT, "apps/backend/src/maintenance/reports.routes.ts");
const frontendPath =
  process.env.VERIFY_MAINT_REPORTS_FRONTEND_PATH ??
  path.join(ROOT, "apps/frontend/src/pages/maintenance/reports/MaintenanceReportsPage.tsx");

const REPORT_IDS = [
  "cost_per_unit",
  "cost_per_mile",
  "cost_by_source_type",
  "pm_compliance_summary",
  "inspection_pass_fail_rate",
  "top_vendors_by_spend",
  "work_orders_over_threshold",
  "work_orders_aged_over_days",
];

function read(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const backend = read(backendPath);
  const frontend = read(frontendPath);
  const failures = [];

  for (const id of REPORT_IDS) {
    if (!backend.includes(id)) failures.push(`missing_backend_report:${id}`);
    if (!frontend.includes(id)) failures.push(`missing_frontend_report:${id}`);
  }
  if (!backend.includes("/export.xlsx")) failures.push("missing_backend_xlsx_export_endpoint");
  if (!frontend.includes("getMaintenanceReportXlsxUrl")) failures.push("missing_frontend_xlsx_export_link");

  if (failures.length > 0) {
    console.error("verify:maintenance-reports-coverage FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:maintenance-reports-coverage OK");
}

main();
