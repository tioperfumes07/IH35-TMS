#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_REPORTS_ROOT ?? process.cwd();
const frontendPath = path.resolve(ROOT, "apps/frontend/src/pages/safety/reports/SafetyReportsPage.tsx");
const backendPath = path.resolve(ROOT, "apps/backend/src/safety/reports/safety-reports.routes.ts");

const frontend = fs.existsSync(frontendPath) ? fs.readFileSync(frontendPath, "utf8") : "";
const backend = fs.existsSync(backendPath) ? fs.readFileSync(backendPath, "utf8") : "";
const failures = [];

if (!frontend.includes("Safety Reports")) failures.push("missing_frontend_page");
if (!backend.includes("/api/v1/safety/reports/:report_id")) failures.push("missing_backend_endpoint");
if (!backend.includes("/export.xlsx")) failures.push("missing_xlsx_export_route");

if (failures.length > 0) {
  console.error("verify:safety-reports-coverage FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:safety-reports-coverage OK");
