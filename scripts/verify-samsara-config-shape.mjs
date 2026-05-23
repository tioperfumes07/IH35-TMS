#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const migrationPath = path.join(ROOT, "db", "migrations", "0215_samsara_config_transp_seed.sql");
const seedScriptPath = path.join(ROOT, "scripts", "seed-samsara-transp.mjs");

function fail(message) {
  console.error(`verify:samsara-config-shape FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(migrationPath)) {
  fail("missing migration db/migrations/0215_samsara_config_transp_seed.sql");
}

const migration = fs.readFileSync(migrationPath, "utf8");
const requiredFragments = [
  "CREATE TABLE IF NOT EXISTS integrations.samsara_config",
  "operating_company_id uuid",
  "encrypted_api_token bytea",
  "token_key_version integer",
  "is_enabled boolean NOT NULL DEFAULT false",
  "connected_at timestamptz",
  "disconnected_at timestamptz",
  "last_health_check_at timestamptz",
  "last_health_status text",
  "created_at timestamptz NOT NULL DEFAULT now()",
  "updated_at timestamptz NOT NULL DEFAULT now()",
  "last_health_status IN ('ok', 'auth_failed', 'rate_limited', 'transient_error', 'not_configured')",
  "CREATE POLICY samsara_config_company_scope",
  "GRANT SELECT, INSERT, UPDATE ON integrations.samsara_config TO ih35_app",
];

for (const fragment of requiredFragments) {
  if (!migration.includes(fragment)) {
    fail(`0215 migration missing required fragment: ${fragment}`);
  }
}

if (/INSERT\s+INTO\s+integrations\.samsara_config/i.test(migration)) {
  fail("0215 migration must not embed credential INSERTs; use one-shot seed script path");
}

if (!fs.existsSync(seedScriptPath)) {
  fail("missing scripts/seed-samsara-transp.mjs one-shot seeding script");
}

console.log("verify:samsara-config-shape OK");
