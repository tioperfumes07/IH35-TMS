#!/usr/bin/env node
/**
 * RPT-S07 — Audit reports section is routed, surfaced in the reports sub-nav,
 * and entity-scoped via AuditReportPage / backend operating_company_id predicate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_ROUTES = [
  "/reports/audit/activity-by-user",
  "/reports/audit/activity-by-module",
  "/reports/audit/financial-change-log",
  "/reports/audit/maintenance-decision-log",
  "/reports/audit/deduction-trail",
  "/reports/audit/void-reversal",
  "/reports/audit/period-close-history",
];
const AUDIT_PAGES = [
  "AuditActivityByUserPage",
  "AuditActivityByModulePage",
  "AuditFinancialChangeLogPage",
  "AuditMaintenanceDecisionLogPage",
  "AuditDeductionTrailPage",
  "AuditVoidReversalPage",
  "AuditPeriodCloseHistoryPage",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

export function run() {
  const errors = [];
  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  const subNav = read("apps/frontend/src/pages/reports/ReportsSubNav.tsx");
  const auditPage = read("apps/frontend/src/pages/reports/audit/AuditReportPage.tsx");
  const backend = read("apps/backend/src/audit/audit-reports.routes.ts");

  for (let i = 0; i < AUDIT_ROUTES.length; i++) {
    const route = AUDIT_ROUTES[i];
    const page = AUDIT_PAGES[i];
    const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert(
      new RegExp('path=["\']' + escapedRoute + '["\']').test(manifest),
      `manifest missing route ${route}`,
      errors,
    );
    assert(
      new RegExp('<' + page + '\\s*/>').test(manifest),
      `manifest route ${route} does not mount ${page}`,
      errors,
    );
    assert(
      new RegExp('href: *["\']' + escapedRoute + '["\']').test(subNav),
      `ReportsSubNav missing exact audit link ${route}`,
      errors,
    );
  }

  assert(auditPage.includes("useCompanyContext"), "AuditReportPage must read selectedCompanyId", errors);
  assert(/operating_company_id:\s*companyId/.test(auditPage), "AuditReportPage must pass operating_company_id", errors);
  assert(/fetchAuditReport\(endpoint,\s*params\)/.test(auditPage), "AuditReportPage must call fetchAuditReport with params", errors);
  assert(/No records for the selected filters/.test(auditPage), "AuditReportPage must have honest empty state", errors);
  assert(/Failed to load report/.test(auditPage), "AuditReportPage must surface error state", errors);

  for (const route of AUDIT_ROUTES) {
    const apiPath = route.replace("/reports/audit/", "/api/v1/audit/reports/");
    assert(
      backend.includes('app.get("' + apiPath + '"'),
      `backend missing route ${apiPath}`,
      errors,
    );
  }
  const endpointBlocks = backend.split("app.get(").slice(1);
  for (const block of endpointBlocks) {
    if (!block.includes('"/api/v1/audit/reports/"')) continue;
    assert(
      /el\.operating_company_id\s*=\s*\$1::uuid/.test(block) ||
      /operating_company_id\s*=\s*\$1/.test(block),
      `backend audit endpoint missing operating_company_id predicate: ${block.slice(0, 80)}`,
      errors,
    );
  }

  return errors;
}

function selftest() {
  const realPath = path.join(ROOT, "apps/frontend/src/pages/reports/ReportsSubNav.tsx");
  const backup = fs.readFileSync(realPath, "utf8");
  try {
    fs.writeFileSync(
      realPath,
      backup.replaceAll('/reports/audit/activity-by-user', '/reports/audit/activity-by-user-orphan'),
      "utf8",
    );
    const planted = run();
    if (!planted.some((e) => e.includes("activity-by-user"))) {
      console.error("[verify-rpt-s07] SELFTEST FAIL: planted stale route not detected");
      process.exit(1);
    }
    console.log(`[verify-rpt-s07] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(realPath, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  const errors = run();
  if (errors.length) {
    console.error("\n[verify-rpt-s07] FAILED:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[verify-rpt-s07] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
