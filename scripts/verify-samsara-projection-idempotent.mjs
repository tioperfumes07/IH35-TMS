#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "db", "migrations", "0291_samsara_projection_seed.sql");

function fail(message) {
  console.error(`verify:samsara-projection-idempotent FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(migrationPath)) {
  fail("missing migration db/migrations/0291_samsara_projection_seed.sql");
}

const source = fs.readFileSync(migrationPath, "utf8");
const mustContain = [
  "BEGIN;",
  "COMMIT;",
  "ON CONFLICT",
  "UPDATE integrations.samsara_vehicles",
  "SET local_unit_id",
  "UPDATE integrations.samsara_drivers",
  "SET local_driver_id",
];

for (const fragment of mustContain) {
  if (!source.includes(fragment)) {
    fail(`missing required fragment: ${fragment}`);
  }
}

console.log("verify:samsara-projection-idempotent OK");
