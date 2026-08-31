#!/usr/bin/env node
/**
 * verify-insurance-monthly-report.mjs
 * Verifies the monthly insurance reporting cron job exists, is wired into server startup,
 * and is named in a CI workflow.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-insurance-monthly-report";
let failed = false;

function fail(msg) { console.error(`[${LABEL}] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[${LABEL}] PASS: ${msg}`); }

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`missing file: ${rel}`); return ""; }
  return fs.readFileSync(abs, "utf8");
}

// 1. Cron file exists
const cronFile = read("apps/backend/src/cron/insurance-monthly-report.cron.ts");
if (cronFile) pass("insurance-monthly-report.cron.ts exists");

// 2. Scheduled on the 5th of each month
if (!cronFile.includes("0 7 5 * *")) fail("cron expression must be '0 7 5 * *' (5th of month 07:00 CT)");
else pass("cron scheduled on 5th of month 07:00 America/Chicago");

// 3. Alarms on gaps — never fails silently
if (!cronFile.includes("severity: \"critical\"")) fail("must create critical notifications for coverage gaps");
else pass("alarms on coverage gaps (critical severity)");

if (!cronFile.includes("insurance_monthly_report_error")) fail("must have error notification type for failures");
else pass("alarms on failure (insurance_monthly_report_error)");

// 4. Wired into server startup
const indexFile = read("apps/backend/src/index.ts");
if (!indexFile.includes("initializeInsuranceMonthlyReportCron")) fail("index.ts must call initializeInsuranceMonthlyReportCron");
else pass("wired into server startup (index.ts)");

// 5. Notification types registered
const notifFile = read("apps/backend/src/notifications/notification.service.ts");
if (!notifFile.includes("insurance_monthly_report")) fail("notification.service.ts missing insurance_monthly_report type");
else pass("notification type insurance_monthly_report registered");

if (!notifFile.includes("insurance_monthly_report_error")) fail("notification.service.ts missing insurance_monthly_report_error type");
else pass("notification type insurance_monthly_report_error registered");

// 6. Named in a CI workflow
const lockedGuards = read(".github/workflows/locked-guards.yml");
if (!lockedGuards.includes("verify:insurance-monthly-report")) fail("not named in any CI workflow");
else pass("named in locked-guards.yml CI workflow");

// 7. package.json script exists
const pkgJson = read("package.json");
if (!pkgJson.includes("verify:insurance-monthly-report")) fail("package.json missing verify:insurance-monthly-report script");
else pass("package.json script exists");

if (failed) { console.error(`\n[${LABEL}] FAILED`); process.exit(1); }
console.log(`\n[${LABEL}] ALL CHECKS PASSED`);
