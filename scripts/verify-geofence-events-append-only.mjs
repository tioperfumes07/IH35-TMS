#!/usr/bin/env node
import fs from "node:fs";

function mustInclude(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

const migrationPath = "db/migrations/0220_cap13_geofencing.sql";
if (!fs.existsSync(migrationPath)) {
  throw new Error(`Missing migration: ${migrationPath}`);
}
const migration = fs.readFileSync(migrationPath, "utf8");

mustInclude(migration, "CREATE TABLE IF NOT EXISTS geo.geofence_events", "geofence events table");
mustInclude(migration, "CREATE OR REPLACE FUNCTION geo.block_geofence_events_mutation()", "append-only trigger function");
mustInclude(migration, "REVOKE UPDATE, DELETE ON geo.geofence_events FROM ih35_app;", "write revocation");
mustInclude(migration, "GRANT SELECT, INSERT ON geo.geofence_events TO ih35_app;", "restricted grants");

const servicePath = "apps/backend/src/telematics/geofence-detector.service.ts";
if (!fs.existsSync(servicePath)) {
  throw new Error(`Missing detector service: ${servicePath}`);
}
const detector = fs.readFileSync(servicePath, "utf8");
mustInclude(detector, "INSERT INTO geo.geofence_events", "event write path");
mustInclude(detector, "ON CONFLICT (operating_company_id, geofence_id, unit_id, event_kind, occurred_at, source) DO NOTHING", "idempotent write");

console.log("verify-geofence-events-append-only: ok");
