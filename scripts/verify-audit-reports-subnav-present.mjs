#!/usr/bin/env node
// AUDIT-REPORTS-MISSING-REPORTS-SUBNAV — guard
//
// All 7 Audit sub-reports (activity-by-user, activity-by-module, void-reversal,
// financial-change-log, period-close-history, maintenance-decision-log, deduction-trail) compose
// the single shared apps/frontend/src/pages/reports/audit/AuditReportPage.tsx component. Every
// OTHER /reports/* page (Balance Sheet, Trial Balance, P&L, Cash Flow Overview, AR/AP Aging, ...)
// renders <ReportsSubNav /> right after its header so a reader can jump to the category hub or a
// sibling report without leaving and re-entering. AuditReportPage never did, so all 7 audit pages
// were missing it — the only way back was the generic one-level PageHeader "Back" arrow.
//
// This guard fails if AuditReportPage.tsx stops importing or rendering ReportsSubNav.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/reports/audit/AuditReportPage.tsx";

export function check(text) {
  const failures = [];
  if (!/import\s*\{\s*ReportsSubNav\s*\}\s*from\s*["']\.\.\/ReportsSubNav["']/.test(text)) {
    failures.push(`${FILE} no longer imports ReportsSubNav from ../ReportsSubNav`);
  }
  if (!/<ReportsSubNav\s*\/>/.test(text)) {
    failures.push(`${FILE} no longer renders <ReportsSubNav />`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: audit-reports-subnav-present");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: AuditReportPage.tsx (all 7 audit report pages) renders ReportsSubNav");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace("<ReportsSubNav />", "");
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (removed <ReportsSubNav />) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted offender correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
