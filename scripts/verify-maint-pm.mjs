#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_MAINT_PM_ROOT ?? process.cwd();
const failures = [];

const migrationPath = path.resolve(ROOT, "db/migrations/0272_maint_parts_pm.sql");
const sharedPath = path.resolve(ROOT, "apps/backend/src/maint/pm-due.shared.ts");
const partsRoutesPath = path.resolve(ROOT, "apps/backend/src/maint/parts.routes.ts");
const pmRoutesPath = path.resolve(ROOT, "apps/backend/src/maint/pm.routes.ts");
const indexPath = path.resolve(ROOT, "apps/backend/src/index.ts");

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const migration = readIfExists(migrationPath);
if (!migration) failures.push("missing_migration_0272_maint_parts_pm");
if (!migration.includes("CREATE SCHEMA IF NOT EXISTS maint")) failures.push("missing_maint_schema");
if (!migration.includes("CREATE TABLE IF NOT EXISTS maint.part")) failures.push("missing_maint_part_table");
if (!migration.includes("CREATE TABLE IF NOT EXISTS maint.pm_schedule")) failures.push("missing_maint_pm_schedule_table");
if (!migration.includes("unit_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0)"))
  failures.push("missing_non_negative_unit_cost_guard");
if (!migration.includes("idx_maint_pm_schedule_tenant_due_miles")) failures.push("missing_pm_due_miles_index");
if (!migration.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON maint.part TO ih35_app"))
  failures.push("missing_maint_part_grants");
if (!migration.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON maint.pm_schedule TO ih35_app"))
  failures.push("missing_maint_pm_schedule_grants");

const shared = readIfExists(sharedPath);
if (!shared.includes("computeNextDueMiles")) failures.push("missing_computeNextDueMiles");
if (!shared.includes("computeNextDueDate")) failures.push("missing_computeNextDueDate");
if (!shared.includes("extractSamsaraOdometerMi")) failures.push("missing_extractSamsaraOdometerMi");
if (!shared.includes("recomputePmScheduleDueFields")) failures.push("missing_recomputePmScheduleDueFields");

const partsRoutes = readIfExists(partsRoutesPath);
if (!partsRoutes.includes("/api/v1/maint/parts")) failures.push("missing_maint_parts_routes");
if (!partsRoutes.includes('app.post("/api/v1/maint/parts"')) failures.push("missing_maint_parts_create_route");
if (!partsRoutes.includes('app.patch("/api/v1/maint/parts/:id"')) failures.push("missing_maint_parts_patch_route");

const pmRoutes = readIfExists(pmRoutesPath);
if (!pmRoutes.includes("/api/v1/maint/pm/due")) failures.push("missing_maint_pm_due_route");
if (!pmRoutes.includes("integrations.samsara_vehicles")) failures.push("missing_samsara_odometer_join");
if (!pmRoutes.includes("extractSamsaraOdometerMi")) failures.push("missing_pm_due_odometer_compute");
// SWEEP-C2 (2026-09-02): POST/PATCH /api/v1/maint/pm/schedules were retired to 410 Gone — zero live
// frontend callers on the legacy write path (superseded by /api/v1/maintenance/pm-schedules). The
// recompute-on-write check below no longer applies to a route that performs no writes; asserting the
// 410 in its place, so a regression that quietly re-adds a live write WITHOUT recompute is still
// caught. recomputePmScheduleDueFields itself is NOT deleted (Rule 07) — see the shared-helper check
// above (missing_recomputePmScheduleDueFields) — it stays available in pm-due.shared.ts.
if (!/app\.post\(\s*"\/api\/v1\/maint\/pm\/schedules"[\s\S]{0,200}410/.test(pmRoutes))
  failures.push("missing_pm_schedules_post_410_gone");
if (!/app\.patch\(\s*"\/api\/v1\/maint\/pm\/schedules\/:id"[\s\S]{0,200}410/.test(pmRoutes))
  failures.push("missing_pm_schedules_patch_410_gone");

const index = readIfExists(indexPath);
if (!index.includes("registerMaintPartsRoutes")) failures.push("missing_registerMaintPartsRoutes");
if (!index.includes("registerMaintPmRoutes")) failures.push("missing_registerMaintPmRoutes");

if (failures.length > 0) {
  console.error("verify:maint-pm FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:maint-pm OK");
