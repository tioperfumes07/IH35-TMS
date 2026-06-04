#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../verify-backend-column-references.mjs");
const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations/0368_identity_users_last_login_at.sql"
);

const result = spawnSync(process.execPath, [scriptPath], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

const migrationSql = fs.readFileSync(migrationPath, "utf8");
if (!/ADD COLUMN IF NOT EXISTS last_login_at/i.test(migrationSql)) {
  console.error("verify-backend-column-references.test: migration missing idempotent last_login_at ADD");
  process.exit(1);
}

console.log("verify-backend-column-references.test PASS");
