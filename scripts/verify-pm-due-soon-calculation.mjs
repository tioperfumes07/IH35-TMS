#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_PM_DUE_SOON_ROOT ?? process.cwd();
const routePath =
  process.env.VERIFY_PM_DUE_SOON_ROUTE_PATH ??
  path.join(ROOT, "apps/backend/src/maintenance/pm-schedule.routes.ts");

function read(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function check(source) {
  const failures = [];

  if (!/const dueSoonConfig\s*=/.test(source)) failures.push("missing_due_soon_config_object");
  if (!/process\.env\.MAINT_PM_DUE_SOON_DAYS/.test(source)) failures.push("missing_days_env_threshold");
  if (!/process\.env\.MAINT_PM_DUE_SOON_MILES/.test(source)) failures.push("missing_miles_env_threshold");
  if (!/process\.env\.MAINT_PM_DUE_SOON_HOURS/.test(source)) failures.push("missing_hours_env_threshold");
  if (!/classifyPmScheduleStatus\(row, reading\?\.odometer \?\? null, today\)/.test(source)) failures.push("missing_pm_status_classifier");
  if (!/evaluatePmDue\(/.test(source)) failures.push("missing_canonical_pm_due_engine");
  return failures;
}

function main() {
  const source = read(routePath);
  const failures = check(source);
  if (process.argv.includes("--selftest") && failures.length === 0) {
    const tokens = ["const dueSoonConfig", "process.env.MAINT_PM_DUE_SOON_DAYS", "process.env.MAINT_PM_DUE_SOON_MILES", "process.env.MAINT_PM_DUE_SOON_HOURS", "classifyPmScheduleStatus(row, reading?.odometer ?? null, today)", "evaluatePmDue("];
    for (const token of tokens) {
      const planted = source.replaceAll(token, "REMOVED");
      if (planted === source || check(planted).length === 0) throw new Error(`inert or uncaught plant: ${token}`);
    }
    console.log(`verify:pm-due-soon-calculation selftest PASS — ${tokens.length} failing plants`);
  }

  if (failures.length > 0) {
    console.error("verify:pm-due-soon-calculation FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:pm-due-soon-calculation OK");
}

main();
