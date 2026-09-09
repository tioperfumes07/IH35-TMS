#!/usr/bin/env node
// INSURANCE-MONTHLY-REPORT-NEVER-SUCCEEDED (routed from PR #21200's own REMAINING note): live-confirmed
// notifications.user_notifications_type_check never allowed type='insurance_monthly_report' /
// 'insurance_monthly_report_error', even though both are declared in the TS NotificationType union
// (notification.service.ts) and insurance-monthly-report.cron.ts inserts them -- every insert raised
// check_violation, so the monthly cron (background_jobs.stale, healthz) never succeeded even after
// PR #21200's per-company transaction-isolation fix removed the masking secondary error. Fixed by
// migration 202614020000 (additive DROP+ADD CHECK widen). This guard pins the migration file's CHECK
// list and the TS union so neither can drift out of sync again without tripping CI.
//
// Usage: node scripts/verify-notifications-type-check-insurance-widen.mjs [--selftest]
import fs from "node:fs";

const LABEL = "verify-notifications-type-check-insurance-widen";
const MIGRATION_PATH = "db/migrations/202614020000_notifications_type_check_insurance_widen.sql";
const NOTIFICATION_SERVICE = "apps/backend/src/notifications/notification.service.ts";

/** Extract the CHECK's ARRAY[...] literal specifically -- never a bare substring test, which the
 * migration file's own header-comment prose (quoting the OLD narrower list for context) would
 * satisfy even after the real ARRAY literal was mutated. */
function extractCheckArray(src) {
  const m = src.match(/ADD CONSTRAINT user_notifications_type_check[\s\S]*?ARRAY\[([\s\S]*?)\]/);
  return m ? m[1] : null;
}

export function migrationWidensCheckToInsuranceTypes(src) {
  const arr = extractCheckArray(src);
  if (!arr) return false;
  const required = [
    "compliance_expiring",
    "compliance_expired",
    "maintenance_alert",
    "load_status",
    "driver_alert",
    "system",
    "message",
    "insurance_monthly_report",
    "insurance_monthly_report_error",
  ];
  return (
    /DROP CONSTRAINT IF EXISTS user_notifications_type_check/.test(src) &&
    required.every((v) => arr.includes(`'${v}'`))
  );
}

export function notificationServiceDeclaresInsuranceTypes(src) {
  return (
    /"insurance_monthly_report"/.test(src) &&
    /"insurance_monthly_report_error"/.test(src) &&
    /export type NotificationType/.test(src)
  );
}

function violations(files) {
  const errors = [];
  if (!fs.existsSync(MIGRATION_PATH)) errors.push(`${MIGRATION_PATH} not found`);
  if (!migrationWidensCheckToInsuranceTypes(files.migration)) {
    errors.push("migration no longer widens user_notifications_type_check's ARRAY literal to admit both insurance types (or dropped a pre-existing value)");
  }
  if (!notificationServiceDeclaresInsuranceTypes(files.notificationService)) {
    errors.push("notification.service.ts no longer declares both insurance_monthly_report* types on NotificationType");
  }
  return errors;
}

function check(files) {
  const errors = violations(files);
  if (errors.length) throw new Error(errors.join("; "));
}

function loadFiles() {
  return {
    migration: fs.existsSync(MIGRATION_PATH) ? fs.readFileSync(MIGRATION_PATH, "utf8") : "",
    notificationService: fs.readFileSync(NOTIFICATION_SERVICE, "utf8"),
  };
}

const files = loadFiles();

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    { ...files, migration: files.migration.replace("    'insurance_monthly_report',\n", "") },
    { ...files, migration: files.migration.replace("    'insurance_monthly_report_error'\n", "") },
    { ...files, migration: files.migration.replace("    'system',\n", "") },
    { ...files, migration: files.migration.replace("DROP CONSTRAINT IF EXISTS user_notifications_type_check", "-- removed") },
    {
      ...files,
      notificationService: files.notificationService.replace('"insurance_monthly_report_error"', '"removed"'),
    },
  ];
  for (const mutated of mutations) {
    try {
      check(mutated);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error("a mutation escaped detection");
  }
  check(files);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(files);
  console.log(`${LABEL} PASS -- notifications type-check widened to admit insurance_monthly_report(_error), matches the TS union`);
}
