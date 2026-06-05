#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const migrationPath = path.join(ROOT, "db/migrations/0379_qbo_sync_drift_log.sql");
const detectorPath = path.join(ROOT, "apps/backend/src/qbo-sync/drift-detector.ts");
const schedulerPath = path.join(ROOT, "apps/backend/src/qbo-sync/sync-scheduler.ts");
const alertsPath = path.join(ROOT, "apps/backend/src/qbo-sync/sync-alerts.ts");
const routesPath = path.join(ROOT, "apps/backend/src/qbo-sync/drift-dashboard.routes.ts");
const dashboardPath = path.join(ROOT, "apps/frontend/src/pages/accounting/QBOSyncDriftDashboard.tsx");

function fail(message) {
  console.error(`verify:qbo-sync-drift-acceptable — FAILED\n- ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`verify:qbo-sync-drift-acceptable — WARN: ${message}`);
}

for (const file of [migrationPath, detectorPath, schedulerPath, alertsPath, routesPath, dashboardPath]) {
  if (!fs.existsSync(file)) {
    fail(`${path.relative(ROOT, file)} not found`);
  }
}

const migration = fs.readFileSync(migrationPath, "utf8");
if (!migration.includes("qbo_sync.drift_log")) {
  fail("migration must create qbo_sync.drift_log");
}
for (const driftType of ["missing_qbo", "missing_local", "field_mismatch"]) {
  if (!migration.includes(driftType)) {
    fail(`migration must allow drift_type ${driftType}`);
  }
}

const detector = fs.readFileSync(detectorPath, "utf8");
for (const entity of ["chart_of_accounts", "items", "customers", "vendors"]) {
  if (!detector.includes(entity)) {
    fail(`drift-detector must cover entity type ${entity}`);
  }
}

const scheduler = fs.readFileSync(schedulerPath, "utf8");
if (!scheduler.includes("0 */4 * * *")) {
  fail("sync-scheduler must run every 4 hours");
}

const routes = fs.readFileSync(routesPath, "utf8");
if (!routes.includes("/api/v1/qbo-sync/drift-dashboard")) {
  fail("routes must expose /api/v1/qbo-sync/drift-dashboard");
}
if (!routes.includes("/api/v1/qbo-sync/drift-log/:id/resolve")) {
  fail("routes must expose /api/v1/qbo-sync/drift-log/:id/resolve");
}

const dashboard = fs.readFileSync(dashboardPath, "utf8");
if (!dashboard.includes("refetchInterval: 60_000")) {
  fail("dashboard must auto-refresh every 60 seconds");
}

// Informational: surface unresolved drift older than 7 days (does not fail CI)
const staleNote =
  "Operator note: after deploy, query qbo_sync.drift_log for resolved_at IS NULL AND detected_at < now() - interval '7 days'.";
warn(staleNote);

console.log("verify:qbo-sync-drift-acceptable — OK");
