#!/usr/bin/env node
/**
 * RPT-S07 — Audit reports section (activity, financial change log, deduction trail, …).
 * Sub-nav + manifest routes + shared AuditReportPage entity scope.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const SUBNAV = "apps/frontend/src/pages/reports/ReportsSubNav.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const SHARED = "apps/frontend/src/pages/reports/audit/AuditReportPage.tsx";

const AUDIT_HREFS = [
  "/reports/audit/activity-by-user",
  "/reports/audit/activity-by-module",
  "/reports/audit/financial-change-log",
  "/reports/audit/maintenance-decision-log",
  "/reports/audit/deduction-trail",
  "/reports/audit/void-reversal",
  "/reports/audit/period-close-history",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function run() {
  const failures = [];
  for (const f of [SUBNAV, MANIFEST, SHARED]) {
    if (!fs.existsSync(path.join(ROOT, f))) failures.push(`MISSING: ${f}`);
  }
  if (failures.length) return failures;

  const sub = read(SUBNAV);
  const man = read(MANIFEST);
  const shared = read(SHARED);

  if (!/AUDIT_REPORT_CHILDREN/.test(sub)) {
    failures.push(`${SUBNAV}: must define AUDIT_REPORT_CHILDREN`);
  }
  if (!/label:\s*"Audit"/.test(sub) || !/children:\s*AUDIT_REPORT_CHILDREN/.test(sub)) {
    failures.push(`${SUBNAV}: must surface Audit flyout with AUDIT_REPORT_CHILDREN`);
  }
  for (const href of AUDIT_HREFS) {
    if (!sub.includes(`href: "${href}"`)) {
      failures.push(`${SUBNAV}: missing audit child ${href}`);
    }
    if (!man.includes(`path="${href}"`)) {
      failures.push(`${MANIFEST}: missing Route ${href}`);
    }
  }
  if (!/useCompanyContext/.test(shared) || !/operating_company_id:\s*companyId/.test(shared)) {
    failures.push(`${SHARED}: must pass operating_company_id from company context`);
  }
  if (!/enabled:\s*Boolean\(companyId\)/.test(shared)) {
    failures.push(`${SHARED}: must not fetch audit rows without companyId`);
  }
  return failures;
}

function main() {
  if (process.argv.includes("--selftest")) {
    const orig = read(SUBNAV);
    const broken = orig.replace(/href: "\/reports\/audit\/activity-by-user"/g, 'href: "/reports/audit/REMOVED"');
    fs.writeFileSync(path.join(ROOT, SUBNAV), broken);
    let fail;
    try {
      fail = run();
    } finally {
      fs.writeFileSync(path.join(ROOT, SUBNAV), orig);
    }
    if (!fail.length) {
      console.error("SELFTEST FAIL: expected failures");
      process.exit(1);
    }
    console.log("SELFTEST OK");
    return;
  }
  const failures = run();
  if (failures.length) {
    console.error("FAIL RPT-S07:");
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }
  console.log("PASS RPT-S07 — audit reports section ratcheted");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
