#!/usr/bin/env node
/**
 * verify-a8-audit-reports-section.mjs
 * Guards for A8-AUDIT-REPORTS-SECTION.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-a8-audit-reports-section";
let failed = false;

function fail(msg) { console.error(`[${LABEL}] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[${LABEL}] PASS: ${msg}`); }
function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`missing file: ${rel}`); return ""; }
  return fs.readFileSync(abs, "utf8");
}

const ROUTES_FILE   = "apps/backend/src/audit/audit-reports.routes.ts";
const INDEX_FILE    = "apps/backend/src/index.ts";
const API_FILE      = "apps/frontend/src/api/auditReports.ts";
const SUBNAV_FILE   = "apps/frontend/src/pages/reports/ReportsSubNav.tsx";
const MANIFEST_FILE = "apps/frontend/src/routes/manifest.tsx";

const routes  = read(ROUTES_FILE);
const index   = read(INDEX_FILE);
const api     = read(API_FILE);
const subnav  = read(SUBNAV_FILE);
const manifest = read(MANIFEST_FILE);

// 1. All 7 report endpoints exist in routes file
const ENDPOINTS = [
  "activity-by-user",
  "activity-by-module",
  "financial-change-log",
  "maintenance-decision-log",
  "deduction-trail",
  "void-reversal",
  "period-close-history",
];
for (const ep of ENDPOINTS) {
  if (!routes.includes(`/api/v1/audit/reports/${ep}`)) fail(`missing route: /api/v1/audit/reports/${ep}`);
  else pass(`route present: /api/v1/audit/reports/${ep}`);
}

// 2. Routes are read-only (no INSERT/UPDATE/DELETE)
if (/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(routes)) fail("audit-reports.routes.ts contains mutation SQL — must be read-only");
else pass("routes are read-only (no INSERT/UPDATE/DELETE)");

// 3. All routes set the tenant RLS GUC — legacy `SET LOCAL app.operating_company_id` OR the
//    SQLi-hardened parameterized `set_config('app.operating_company_id', $1, true)` form.
const rlsCount = (routes.match(/(?:SET LOCAL app\.operating_company_id|set_config\(\s*['"]app\.operating_company_id['"])/g) || []).length;
if (rlsCount < ENDPOINTS.length) fail(`only ${rlsCount} of ${ENDPOINTS.length} routes apply tenant RLS scope`);
else pass(`all ${rlsCount} routes apply tenant RLS scope`);

// 4. All routes paginate (LIMIT/OFFSET)
if (!routes.includes("LIMIT") || !routes.includes("OFFSET")) fail("routes missing LIMIT/OFFSET pagination");
else pass("pagination present in routes");

// 5. registerAuditReportRoutes registered in index.ts
if (!index.includes("registerAuditReportRoutes")) fail("registerAuditReportRoutes not registered in index.ts");
else pass("registerAuditReportRoutes registered in index.ts");

// 6. API client has all 7 endpoint keys
for (const ep of ENDPOINTS) {
  const camel = ep.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (!api.includes(camel)) fail(`api/auditReports.ts missing endpoint key: ${camel}`);
  else pass(`api key present: ${camel}`);
}

// 7. ReportsSubNav has Audit nav item
if (!subnav.includes('"Audit"')) fail("ReportsSubNav.tsx missing Audit nav item");
else pass("ReportsSubNav.tsx has Audit nav item");

// 8. All 7 audit routes in manifest.tsx
for (const ep of ENDPOINTS) {
  if (!manifest.includes(`/reports/audit/${ep}`)) fail(`manifest.tsx missing route: /reports/audit/${ep}`);
  else pass(`manifest route present: /reports/audit/${ep}`);
}

// 9. All 7 page components exist
const PAGES = [
  "apps/frontend/src/pages/reports/audit/AuditActivityByUserPage.tsx",
  "apps/frontend/src/pages/reports/audit/AuditActivityByModulePage.tsx",
  "apps/frontend/src/pages/reports/audit/AuditFinancialChangeLogPage.tsx",
  "apps/frontend/src/pages/reports/audit/AuditMaintenanceDecisionLogPage.tsx",
  "apps/frontend/src/pages/reports/audit/AuditDeductionTrailPage.tsx",
  "apps/frontend/src/pages/reports/audit/AuditVoidReversalPage.tsx",
  "apps/frontend/src/pages/reports/audit/AuditPeriodCloseHistoryPage.tsx",
];
for (const p of PAGES) {
  if (!fs.existsSync(path.join(ROOT, p))) fail(`missing page: ${p}`);
  else pass(`page exists: ${path.basename(p)}`);
}

if (failed) { console.error(`\n[${LABEL}] FAILED`); process.exit(1); }
console.log(`\n[${LABEL}] ALL CHECKS PASSED`);
