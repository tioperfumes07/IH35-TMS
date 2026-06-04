#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const USERS_ROUTES = path.join(ROOT, "apps/backend/src/identity/users.routes.ts");
const SESSION_CREATE = path.join(ROOT, "apps/backend/src/auth/session-create.ts");

function fail(message) {
  console.error(`verify:identity-users-last-login-at-column — FAILED\n- ${message}`);
  process.exit(1);
}

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const migrationWithColumn = migrationFiles.find((name) => {
  const text = fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
  return (
    /ALTER\s+TABLE\s+identity\.users/i.test(text) &&
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+last_login_at/i.test(text)
  );
});

if (!migrationWithColumn) {
  fail("no migration adds identity.users.last_login_at (expected ADD COLUMN IF NOT EXISTS last_login_at)");
}

const migrationText = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationWithColumn), "utf8");
if (!/COMMENT\s+ON\s+COLUMN\s+identity\.users\.last_login_at/i.test(migrationText)) {
  fail(`${migrationWithColumn} must COMMENT ON COLUMN identity.users.last_login_at`);
}
if (!/GRANT\s+[\s\S]*\s+ON\s+identity\.users\s+TO\s+ih35_app/i.test(migrationText)) {
  fail(`${migrationWithColumn} must GRANT on identity.users TO ih35_app`);
}

if (!fs.existsSync(USERS_ROUTES)) fail("apps/backend/src/identity/users.routes.ts not found");
const usersRoutesText = fs.readFileSync(USERS_ROUTES, "utf8");
if (!/last_login_at::text\s+AS\s+last_login_at/i.test(usersRoutesText)) {
  fail("users list route must SELECT last_login_at::text AS last_login_at");
}
if (!/last_login_at:\s*row\.last_login_at/i.test(usersRoutesText)) {
  fail("mapIdentityUser must expose last_login_at on list payload");
}

if (!fs.existsSync(SESSION_CREATE)) fail("apps/backend/src/auth/session-create.ts not found");
const sessionCreateText = fs.readFileSync(SESSION_CREATE, "utf8");
if (!/UPDATE\s+identity\.users\s+SET\s+last_login_at\s*=\s*now\(\)/i.test(sessionCreateText)) {
  fail("session-create must UPDATE identity.users.last_login_at on login");
}

console.log(
  `verify:identity-users-last-login-at-column — OK (${migrationWithColumn}, users.routes.ts, session-create.ts)`
);
