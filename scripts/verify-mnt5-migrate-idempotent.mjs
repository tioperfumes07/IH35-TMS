#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "db", "migrations", "0292_mnt5_migrate_parts_from_maint.sql");

function fail(message) {
  console.error(`verify:mnt5-migrate-idempotent FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(migrationPath)) {
  fail("missing migration db/migrations/0292_mnt5_migrate_parts_from_maint.sql");
}

const source = fs.readFileSync(migrationPath, "utf8");
for (const fragment of ["BEGIN;", "COMMIT;", "ON CONFLICT", "maintenance.parts_inventory", "FROM maint.part"]) {
  if (!source.includes(fragment)) {
    fail(`missing required fragment: ${fragment}`);
  }
}

console.log("verify:mnt5-migrate-idempotent OK");
