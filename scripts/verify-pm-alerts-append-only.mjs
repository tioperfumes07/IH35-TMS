#!/usr/bin/env node
import fs from "node:fs";

function mustInclude(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

const migrationPath = "db/migrations/0223_cap7_maintenance_pm_alerts.sql";
if (!fs.existsSync(migrationPath)) {
  throw new Error(`Missing CAP-7 migration: ${migrationPath}`);
}
const migration = fs.readFileSync(migrationPath, "utf8");
mustInclude(migration, "CREATE TABLE IF NOT EXISTS maintenance.pm_alerts", "pm_alerts table");
mustInclude(migration, "CREATE OR REPLACE FUNCTION maintenance.pm_alerts_update_guard()", "update guard trigger function");
mustInclude(migration, "CREATE OR REPLACE FUNCTION maintenance.pm_alerts_delete_block()", "delete block trigger function");
mustInclude(migration, "REVOKE DELETE ON maintenance.pm_alerts FROM ih35_app;", "delete revoked");

const predictorPath = "apps/backend/src/telematics/maintenance-predictor.service.ts";
if (!fs.existsSync(predictorPath)) {
  throw new Error(`Missing maintenance predictor service: ${predictorPath}`);
}
const predictor = fs.readFileSync(predictorPath, "utf8");
mustInclude(predictor, "INSERT INTO maintenance.pm_alerts", "insert alert path");
if (predictor.includes("DELETE FROM maintenance.pm_alerts")) {
  throw new Error("Delete path is not allowed for maintenance.pm_alerts");
}

console.log("verify-pm-alerts-append-only: ok");
