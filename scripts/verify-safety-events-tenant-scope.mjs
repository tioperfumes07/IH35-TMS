#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(root, "db/migrations/0261_safety_events.sql");
const routesPath = path.join(root, "apps/backend/src/safety/events/safety-events.routes.ts");

function fail(message) {
  console.error(`verify:safety-events-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [migrationPath, routesPath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const migration = fs.readFileSync(migrationPath, "utf8");
const routes = fs.readFileSync(routesPath, "utf8");

const requiredRouteSnippets = [
  "const companyQuerySchema = z.object",
  "SET LOCAL app.operating_company_id",
  "operating_company_id = $1::uuid",
  "operating_company_id = $2::uuid",
];

for (const snippet of requiredRouteSnippets) {
  if (!routes.includes(snippet)) fail(`routes must enforce tenant scoping with: ${snippet}`);
}

const requiredMigrationSnippets = [
  "ALTER TABLE safety.safety_events ENABLE ROW LEVEL SECURITY",
  "ALTER TABLE safety.safety_event_notes ENABLE ROW LEVEL SECURITY",
  "CREATE POLICY safety_events_tenant_scope",
  "CREATE POLICY safety_event_notes_tenant_scope",
  "operating_company_id::text = current_setting('app.operating_company_id', true)",
];

for (const snippet of requiredMigrationSnippets) {
  if (!migration.includes(snippet)) fail(`migration must include tenant guard: ${snippet}`);
}

console.log("verify:safety-events-tenant-scope — OK");
