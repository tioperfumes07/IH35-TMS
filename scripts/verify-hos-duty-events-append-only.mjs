#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) throw new Error(`missing file: ${relPath}`);
  return fs.readFileSync(full, "utf8");
}

function fail(lines) {
  console.error("verify:hos-duty-events-append-only — FAILED");
  for (const line of lines) console.error(`- ${line}`);
  process.exit(1);
}

const failures = [];
let migration = "";
let projector = "";
try {
  migration = read("db/migrations/0219_cap11_hos_duty_status_events.sql");
  projector = read("apps/backend/src/integrations/samsara/webhook-projectors/hos-projector.ts");
} catch (error) {
  fail([String(error instanceof Error ? error.message : error)]);
}

if (!migration.includes("CREATE TABLE IF NOT EXISTS hos.duty_status_events")) {
  failures.push("db/migrations/0219_cap11_hos_duty_status_events.sql: missing duty_status_events table");
}
if (!migration.includes("append-only") || !migration.includes("block_duty_status_events_mutation")) {
  failures.push("db/migrations/0219_cap11_hos_duty_status_events.sql: append-only trigger guard missing");
}
if (!migration.includes("REVOKE UPDATE, DELETE ON hos.duty_status_events FROM ih35_app")) {
  failures.push("db/migrations/0219_cap11_hos_duty_status_events.sql: ih35_app must not update/delete duty events");
}
if (!migration.includes("GRANT SELECT, INSERT ON hos.duty_status_events TO ih35_app")) {
  failures.push("db/migrations/0219_cap11_hos_duty_status_events.sql: ih35_app must retain select/insert");
}
if (!projector.includes("INSERT INTO hos.duty_status_events")) {
  failures.push("apps/backend/src/integrations/samsara/webhook-projectors/hos-projector.ts: webhook projection must insert duty events");
}
if (!projector.includes("ON CONFLICT (operating_company_id, driver_id, duty_status, started_at, source)")) {
  failures.push("apps/backend/src/integrations/samsara/webhook-projectors/hos-projector.ts: projector must be idempotent");
}

if (failures.length > 0) fail(failures);
console.log("verify:hos-duty-events-append-only — OK");
