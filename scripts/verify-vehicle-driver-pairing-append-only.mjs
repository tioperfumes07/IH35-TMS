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
export function auditService(service) {
  const problems = [];
  const required = [
    ["UPDATE telematics.vehicle_driver_assignments", "ended_at close path"],
    ["ON CONFLICT (raw_event_id) DO NOTHING", "idempotent insert"],
    ["pg_advisory_lock(hashtextextended($1, 0))", "company+unit lifecycle lock"],
    ["pg_advisory_unlock(hashtextextended($1, 0))", "lifecycle lock release"],
    ["WHERE raw_event_id = $1::uuid", "exact-event replay check"],
    ["vehicle_driver_assignment_close_lost_race", "checked close identity"],
    ["vehicle_driver_assignment_insert_not_persisted", "checked insert identity"],
  ];
  for (const [needle, description] of required) {
    if (!service.includes(needle)) problems.push(`Missing ${description}: ${needle}`);
  }
  if ((service.match(/RETURNING id::text/g) ?? []).length < 2) problems.push("Both pairing writes must return identity");
  if (service.includes("DELETE FROM telematics.vehicle_driver_assignments")) problems.push("Delete path is not allowed");
  return problems;
}

const service = fs.readFileSync(servicePath, "utf8");
if (process.argv.includes("--selftest")) {
  const planted = service.replace("pg_advisory_lock(hashtextextended($1, 0))", "pg_sleep(0)");
  if (!auditService(planted).some((problem) => problem.includes("lifecycle lock"))) throw new Error("selftest failed to catch missing lifecycle lock");
  console.log("verify-vehicle-driver-pairing-append-only: selftest PASS — missing lifecycle lock planted and detected");
} else {
  const problems = auditService(service);
  if (problems.length) throw new Error(problems.join("\n"));
  console.log("verify-vehicle-driver-pairing-append-only: ok");
}
