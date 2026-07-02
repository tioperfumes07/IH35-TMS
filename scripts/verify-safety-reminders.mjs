#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INDEX_FILE = path.join(ROOT, "apps/backend/src/index.ts");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/safety/reminders.routes.ts");
const CRON_FILE = path.join(ROOT, "apps/backend/src/safety/reminders.cron.ts");
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0269_safety_reminders.sql");

function fail(message) {
  console.error(`verify:safety-reminders — FAILED\n- ${message}`);
  process.exit(1);
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) fail(message);
}

for (const file of [INDEX_FILE, ROUTES_FILE, CRON_FILE, MIGRATION_FILE]) {
  if (!fs.existsSync(file)) fail(`missing required file ${path.relative(ROOT, file)}`);
}

const indexSource = fs.readFileSync(INDEX_FILE, "utf8");
const routesSource = fs.readFileSync(ROUTES_FILE, "utf8");
const cronSource = fs.readFileSync(CRON_FILE, "utf8");
const migrationSource = fs.readFileSync(MIGRATION_FILE, "utf8");

requirePattern(indexSource, /registerSafetyRemindersRoutes/, "index must import/register safety reminders routes");
requirePattern(indexSource, /await registerSafetyRemindersRoutes\(app\)/, "index must bootstrap safety reminders routes");
requirePattern(indexSource, /initializeSafetyRemindersCron/, "index must import/initialize safety reminders cron");

requirePattern(routesSource, /app\.get\("\/api\/v1\/safety\/reminders"/, "missing reminders list route");
requirePattern(routesSource, /app\.patch\("\/api\/v1\/safety\/reminders\/:id"/, "missing reminders patch route");
requirePattern(routesSource, /refreshSafetyReminders/, "routes must refresh reminders snapshot");
// Tenant scope may be set via the legacy `SET LOCAL app.operating_company_id = '...'` form OR the
// SQLi-hardened parameterized `set_config('app.operating_company_id', $1, true)` form — accept both.
requirePattern(routesSource, /(?:SET LOCAL app\.operating_company_id|set_config\(\s*['"]app\.operating_company_id['"])/, "routes must set tenant scope");

requirePattern(cronSource, /safety\.reminders_cron/, "cron job key must be safety.reminders_cron");
requirePattern(cronSource, /safety\.compliance_reminders/, "cron must write compliance reminders table");

requirePattern(migrationSource, /CREATE TABLE IF NOT EXISTS safety\.compliance_reminders/, "migration must create safety reminders table");
requirePattern(migrationSource, /idx_safety_reminders_company_status_due/, "migration must add reminder company index");

console.log("verify:safety-reminders — OK");
