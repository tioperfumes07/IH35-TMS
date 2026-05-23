#!/usr/bin/env node
import fs from "node:fs";

const migrationPath = "db/migrations/0233_cap1_vehicle_locations.sql";
const src = fs.readFileSync(migrationPath, "utf8");
const required = [
  "CREATE TABLE IF NOT EXISTS telematics.vehicle_locations",
  "CREATE TRIGGER trg_block_vehicle_locations_update",
  "CREATE TRIGGER trg_block_vehicle_locations_delete",
  "REVOKE UPDATE, DELETE ON telematics.vehicle_locations FROM ih35_app",
];

const missing = required.filter((snippet) => !src.includes(snippet));
if (missing.length > 0) {
  console.error("verify-vehicle-locations-append-only failed");
  for (const snippet of missing) console.error(`  missing: ${snippet}`);
  process.exit(1);
}

console.log("verify-vehicle-locations-append-only: ok");
