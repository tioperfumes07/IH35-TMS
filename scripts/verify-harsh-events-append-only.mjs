#!/usr/bin/env node
import fs from "node:fs";

const migrationPath = "db/migrations/0231_cap10_driver_scoring_harsh_events.sql";
const src = fs.readFileSync(migrationPath, "utf8");
const required = [
  "CREATE TABLE IF NOT EXISTS safety.harsh_events",
  "UNIQUE (operating_company_id, raw_samsara_id)",
  "CREATE TRIGGER trg_block_harsh_events_update",
  "CREATE TRIGGER trg_block_harsh_events_delete",
  "REVOKE UPDATE, DELETE ON safety.harsh_events FROM ih35_app",
  "GRANT SELECT, INSERT ON safety.harsh_events TO ih35_app",
];

const missing = required.filter((snippet) => !src.includes(snippet));
if (missing.length > 0) {
  console.error("verify-harsh-events-append-only failed");
  for (const snippet of missing) {
    console.error(`  missing: ${snippet}`);
  }
  process.exit(1);
}

console.log("verify-harsh-events-append-only: ok");
