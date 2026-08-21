#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(root, "db/migrations/0261_safety_events.sql");
const routesPath = path.join(root, "apps/backend/src/safety/events/safety-events.routes.ts");

function fail(message) {
  console.error(`verify:safety-events-append-only — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [migrationPath, routesPath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const migration = fs.readFileSync(migrationPath, "utf8");
const routes = fs.readFileSync(routesPath, "utf8");

function verifyNoteAuthorLabel(source) {
  if (!/COALESCE\(NULLIF\(TRIM\(CONCAT_WS\(' ', i\.first_name, i\.last_name\)\), ''\), i\.email\) AS created_by_name/.test(source)) {
    throw new Error("note history must resolve a human author label from canonical identity.users columns");
  }
  if (/i\.name AS created_by_name/.test(source)) throw new Error("note history must not read nonexistent identity.users.name");
}

if (process.argv.includes("--selftest")) {
  let caught = false;
  try { verifyNoteAuthorLabel(routes.replace(/COALESCE\(NULLIF\(TRIM\(CONCAT_WS\(' ', i\.first_name, i\.last_name\)\), ''\), i\.email\) AS created_by_name/, "i.name AS created_by_name")); } catch { caught = true; }
  if (!caught) fail("planted phantom author-name regression was not caught");
  console.log("verify:safety-events-append-only — SELFTEST OK");
  process.exit(0);
}

const requiredMigrationSnippets = [
  "safety.safety_events is append-only",
  "safety.safety_event_notes is append-only",
  "BEFORE UPDATE ON safety.safety_events",
  "BEFORE DELETE ON safety.safety_events",
  "BEFORE UPDATE ON safety.safety_event_notes",
  "BEFORE DELETE ON safety.safety_event_notes",
  "REVOKE UPDATE, DELETE ON safety.safety_events",
  "REVOKE UPDATE, DELETE ON safety.safety_event_notes",
  "GRANT SELECT, INSERT ON safety.safety_events TO ih35_app",
  "GRANT SELECT, INSERT ON safety.safety_event_notes TO ih35_app",
];

for (const snippet of requiredMigrationSnippets) {
  if (!migration.includes(snippet)) fail(`migration must include: ${snippet}`);
}

if (routes.includes("app.patch(\"/api/v1/safety/events-log")) {
  fail("routes must not expose PATCH endpoints for safety events");
}
if (routes.includes("app.delete(\"/api/v1/safety/events-log")) {
  fail("routes must not expose DELETE endpoints for safety events");
}
try { verifyNoteAuthorLabel(routes); } catch (error) { fail(error instanceof Error ? error.message : String(error)); }

console.log("verify:safety-events-append-only — OK");
