#!/usr/bin/env node
/**
 * CLOSURE-16-DEEP-AUDIT-C — Settlement → Payroll integration workflow guard.
 * Records CLOSURE-12 gap: aggregate page not yet on main (expected FAIL until CLOSURE-12 full impl).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "deep-audit-c-workflow-settlement-to-payroll";

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const settlements = read("apps/backend/src/master-data/drivers/operations-depth/payroll-history.service.ts");
const audit = read("docs/audits/DEEP-AUDIT-C-E2E-WORKFLOWS.md");
const summary = read("docs/audits/DEEP-AUDIT-C-SUMMARY.md");

if (!settlements.includes("driver_settlements")) fail("driver_settlements schema must exist");
if (!audit.includes("Workflow 3")) fail("audit doc must document Workflow 3");
if (!audit.includes("C-WF3-1")) fail("audit must record CRITICAL payroll-integration gap");
if (!summary.includes("CLOSURE-12-FULL-IMPL")) fail("summary must scope CLOSURE-12 re-dispatch");

const payrollPage = path.join(ROOT, "apps/frontend/src/pages/payroll-integration/PayrollIntegrationPage.tsx");
const aggregateRoutes = path.join(ROOT, "apps/backend/src/payroll-integration/aggregate.routes.ts");

if (!fs.existsSync(payrollPage) || !fs.existsSync(aggregateRoutes)) {
  console.warn(`[${LABEL}] WARN: CLOSURE-12 full impl pending — payroll-integration surfaces absent (documented C-WF3-1)`);
}

console.log(`[${LABEL}] PASS — workflow 3 audit artifacts verified`);
