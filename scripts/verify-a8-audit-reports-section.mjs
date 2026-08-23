#!/usr/bin/env node
/**
 * @matrix-built {"modules":["reports"],"cols":["connectivity","reverse_link"],"leafRe":"^audit\\.(activity_by_user|activity_by_module|financial_change_log|maintenance_decision_log|deduction_trail|void_reversal|period_close_history)$","task":"LV-REPORTS-AUDIT-SUBJECT-IDENTITY-BYPASSES-CANONICAL-RESOLVER","vertical":"class-sweep"}
 * A8 audit reports — seven mounted, entity-scoped read-only leaves plus canonical typed subject
 * identity. This guard owns the whole sibling class so a second raw-UUID audit serializer cannot
 * drift away from System Audit again.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = {
  routes: "apps/backend/src/audit/audit-reports.routes.ts",
  index: "apps/backend/src/index.ts",
  api: "apps/frontend/src/api/auditReports.ts",
  subnav: "apps/frontend/src/pages/reports/ReportsSubNav.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  page: "apps/frontend/src/pages/reports/audit/AuditReportPage.tsx",
};
const ENDPOINTS = [
  "activity-by-user", "activity-by-module", "financial-change-log", "maintenance-decision-log",
  "deduction-trail", "void-reversal", "period-close-history",
];
const PAGES = [
  "AuditActivityByUserPage.tsx", "AuditActivityByModulePage.tsx", "AuditFinancialChangeLogPage.tsx",
  "AuditMaintenanceDecisionLogPage.tsx", "AuditDeductionTrailPage.tsx",
  "AuditVoidReversalPage.tsx", "AuditPeriodCloseHistoryPage.tsx",
];

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function realSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, read(rel)]));
}

function audit(sources) {
  const failures = [];
  const { routes, index, api, subnav, manifest, page } = sources;
  for (const ep of ENDPOINTS) {
    if (!routes.includes(`/api/v1/audit/reports/${ep}`)) failures.push(`backend route missing: ${ep}`);
    if (!manifest.includes(`/reports/audit/${ep}`)) failures.push(`frontend route missing: ${ep}`);
    const camel = ep.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!api.includes(camel)) failures.push(`API key missing: ${camel}`);
  }
  if (/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(routes)) failures.push("audit routes must remain read-only");
  const rlsCount = (routes.match(/set_config\(\s*['"]app\.operating_company_id['"]/g) || []).length;
  if (rlsCount < ENDPOINTS.length) failures.push(`only ${rlsCount}/7 routes set tenant RLS context`);
  if (!routes.includes("LIMIT") || !routes.includes("OFFSET")) failures.push("pagination missing");
  if (!index.includes("registerAuditReportRoutes")) failures.push("backend routes not mounted");
  if (!subnav.includes('label: "Audit"')) failures.push("Reports Audit navigation missing");
  for (const name of PAGES) {
    if (!fs.existsSync(path.join(ROOT, "apps/frontend/src/pages/reports/audit", name))) failures.push(`page missing: ${name}`);
  }

  if (!routes.includes("function auditSubjectProjection") || !routes.includes("function auditSubjectJoins")) {
    failures.push("shared audit subject resolver missing");
  }
  const projectionCalls = (routes.match(/auditSubjectProjection\("(?:el|c)"\)/g) || []).length;
  const joinCalls = (routes.match(/auditSubjectJoins\("(?:el|c)"\)/g) || []).length;
  if (projectionCalls !== ENDPOINTS.length) failures.push(`typed subject projection covers ${projectionCalls}/7 endpoints`);
  if (joinCalls !== ENDPOINTS.length) failures.push(`canonical label joins cover ${joinCalls}/7 endpoints`);
  for (const token of [
    "END AS subject_kind", "END AS subject_label", "maintenance.work_orders",
    "accounting.invoices", "accounting.bills",
    "audit_load.operating_company_id = ${alias}.operating_company_id",
    "audit_wo.operating_company_id = ${alias}.operating_company_id",
    "audit_invoice.operating_company_id = ${alias}.operating_company_id",
    "audit_bill.operating_company_id = ${alias}.operating_company_id",
    "COALESCE(audit_unit.currently_leased_to_company_id, audit_unit.owner_company_id) = ${alias}.operating_company_id",
  ]) if (!routes.includes(token)) failures.push(`resolver contract missing: ${token}`);
  if (!/FROM mdata\.driver_company_authorizations audit_driver_dca[\s\S]{0,180}audit_driver_dca\.driver_id = audit_driver\.id[\s\S]{0,180}audit_driver_dca\.company_id = \$\{alias\}\.operating_company_id[\s\S]{0,180}audit_driver_dca\.is_authorized = true[\s\S]{0,180}audit_driver_dca\.deactivated_at IS NULL/.test(routes)) {
    failures.push("audit driver resolver excludes active canonical shared-driver authorization");
  }

  if (!/subject_kind:\s*string\s*\|\s*null/.test(api)) failures.push("API omits subject_kind");
  if (!/subject_label:\s*string\s*\|\s*null/.test(api)) failures.push("API omits subject_label");
  if (!/row\.subject_kind\s*\?\?\s*row\.subject_type/.test(page)) failures.push("UI does not consume typed subject kind");
  if (!/entityLabel\(row\.subject_label,\s*row\.subject_id/.test(page)) failures.push("UI does not consume canonical subject label");
  if (!/load:\s*"load"/.test(page) || !/work_order:\s*"work_order"/.test(page)) failures.push("UI omits load/work-order EntityLink kinds");
  if (/entityLabel\(null,\s*row\.subject_id/.test(page)) failures.push("raw UUID fallback remains in audit subject rendering");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const base = realSources();
  const mutations = [
    ["projection-all", { routes: base.routes.replaceAll('auditSubjectProjection("el")', 'missingProjection("el")').replace('auditSubjectProjection("c")', 'missingProjection("c")') }],
    ["joins-all", { routes: base.routes.replaceAll('auditSubjectJoins("el")', 'missingJoins("el")').replace('auditSubjectJoins("c")', 'missingJoins("c")') }],
    ["company-scope", { routes: base.routes.replace("audit_load.operating_company_id = ${alias}.operating_company_id", "TRUE") }],
    ["shared-driver-authorization", { routes: base.routes.replace("FROM mdata.driver_company_authorizations audit_driver_dca", "FROM removed audit_driver_dca") }],
    ["api-kind", { api: base.api.replace("subject_kind: string | null", "missing_kind: string | null") }],
    ["api-label", { api: base.api.replace("subject_label: string | null", "missing_label: string | null") }],
    ["ui-kind", { page: base.page.replaceAll("row.subject_kind ?? row.subject_type", "row.subject_type") }],
    ["ui-label", { page: base.page.replace("entityLabel(row.subject_label, row.subject_id", "entityLabel(null, row.subject_id") }],
    ["load-link", { page: base.page.replace('load: "load"', 'load: "driver"') }],
    ["work-order-link", { page: base.page.replace('work_order: "work_order"', 'work_order: "task"') }],
    ["endpoint", { routes: base.routes.replace("/api/v1/audit/reports/activity-by-user", "/missing/activity-by-user") }],
  ];
  for (const [name, override] of mutations) {
    if (!audit({ ...base, ...override }).length) {
      console.error(`verify-a8-audit-reports-section SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`verify-a8-audit-reports-section SELFTEST PASS — ${mutations.length}/${mutations.length} planted regressions caught`);
  process.exit(0);
}

const failures = audit(realSources());
if (failures.length) {
  console.error(`verify-a8-audit-reports-section FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-a8-audit-reports-section PASS — seven scoped audit leaves share typed canonical subject labels and drills");
