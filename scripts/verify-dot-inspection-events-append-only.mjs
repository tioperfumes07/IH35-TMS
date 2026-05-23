#!/usr/bin/env node
import fs from "node:fs";

const migration = "db/migrations/0229_cap13_dot_inspection_dwell.sql";
if (!fs.existsSync(migration)) throw new Error(`Missing migration: ${migration}`);
const sql = fs.readFileSync(migration, "utf8");

const required = [
  "CREATE TABLE IF NOT EXISTS compliance.dot_inspection_events",
  "CREATE TRIGGER trg_dot_inspection_events_block_update",
  "CREATE TRIGGER trg_dot_inspection_events_block_delete",
  "REVOKE UPDATE, DELETE ON compliance.dot_inspection_events",
];
for (const token of required) {
  if (!sql.includes(token)) throw new Error(`Missing append-only enforcement token: ${token}`);
}

console.log("verify-dot-inspection-events-append-only: ok");
