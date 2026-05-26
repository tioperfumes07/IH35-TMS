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

function main() {
  const source = read(routePath);
  const failures = [];

  if (!/const dueSoonConfig\s*=/.test(source)) failures.push("missing_due_soon_config_object");
  if (!/process\.env\.MAINT_PM_DUE_SOON_DAYS/.test(source)) failures.push("missing_days_env_threshold");
  if (!/process\.env\.MAINT_PM_DUE_SOON_MILES/.test(source)) failures.push("missing_miles_env_threshold");
  if (!/process\.env\.MAINT_PM_DUE_SOON_HOURS/.test(source)) failures.push("missing_hours_env_threshold");
  if (!/classifyPmStatus\(/.test(source)) failures.push("missing_pm_status_classifier");

  if (failures.length > 0) {
    console.error("verify:pm-due-soon-calculation FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:pm-due-soon-calculation OK");
}

main();
