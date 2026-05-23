#!/usr/bin/env node
import fs from "node:fs";

function mustInclude(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

const migrationPath = "db/migrations/0221_cap9_vehicle_driver_assignments.sql";
if (!fs.existsSync(migrationPath)) {
  throw new Error(`Missing migration: ${migrationPath}`);
}
const migration = fs.readFileSync(migrationPath, "utf8");
mustInclude(migration, "CREATE TABLE IF NOT EXISTS telematics.vehicle_driver_assignments", "pairing table");
mustInclude(migration, "CREATE OR REPLACE FUNCTION telematics.block_vehicle_driver_assignments_update()", "update trigger function");
mustInclude(migration, "CREATE OR REPLACE FUNCTION telematics.block_vehicle_driver_assignments_delete()", "delete trigger function");
mustInclude(migration, "REVOKE DELETE ON telematics.vehicle_driver_assignments FROM ih35_app;", "delete revocation");

const servicePath = "apps/backend/src/telematics/vehicle-driver-lookup.service.ts";
if (!fs.existsSync(servicePath)) {
  throw new Error(`Missing service: ${servicePath}`);
}
const service = fs.readFileSync(servicePath, "utf8");
mustInclude(service, "UPDATE telematics.vehicle_driver_assignments", "ended_at close path");
mustInclude(service, "ON CONFLICT (raw_event_id) DO NOTHING", "idempotent insert");
if (service.includes("DELETE FROM telematics.vehicle_driver_assignments")) {
  throw new Error("Delete path is not allowed for telematics.vehicle_driver_assignments");
}

console.log("verify-vehicle-driver-pairing-append-only: ok");
