#!/usr/bin/env node
/**
 * GAP-PREMERGE-GATES-EXPAND Gate 3: Migration role validation.
 *
 * Scans SQL migration files for GRANT ... TO <role> statements.
 * Any role that is not in the canonical allowed list causes CI failure
 * with a clear, actionable error message.
 *
 * This catches the GAP-81 failure class: a migration grants privileges to a
 * role that doesn't exist on the Neon DB, causing the migration to fail at
 * apply time with "role does not exist".
 *
 * Scope: Only migrations numbered higher than BASELINE_MIGRATION_NUM are
 * checked.  Migrations below the baseline were authored before this gate
 * existed and have been reviewed/grandfathered.  The baseline is set to the
 * last migration present on main when this gate was introduced (0406).
 *
 * Allowed roles (canonical Neon roles for this project):
 *   ih35_app       — application runtime role
 *   neondb_owner   — schema owner / migration runner
 *   CURRENT_USER   — dynamic reference (valid in migration context)
 *   PUBLIC         — SQL standard public pseudo-role
 *   pg_read_all_data, pg_write_all_data — Postgres built-in roles
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");

/**
 * Migrations with a sequence number <= this value are grandfathered.
 * Only migrations newer than this baseline are checked.
 * Set to the highest migration number on main when this gate was introduced.
 */
const BASELINE_MIGRATION_NUM = 406;

/** Roles that are known to exist on the Neon Postgres cluster. */
const ALLOWED_ROLES = new Set([
  "ih35_app",
  "neondb_owner",
  "CURRENT_USER",
  "current_user",
  "PUBLIC",
  "public",
  "pg_read_all_data",
  "pg_write_all_data",
  "pg_monitor",
  "pg_signal_backend",
]);

function fail(msg) {
  console.error(`verify:migration-no-unknown-roles FAIL: ${msg}`);
  process.exit(1);
}

/** Strip single-line SQL comments (-- ...) to avoid matching roles in comment text. */
function stripLineComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

/**
 * Extract all role names from GRANT ... TO <role_list> statements.
 * Handles: GRANT priv ON obj TO role1, role2
 * Skips: dynamic GRANT inside format() strings (inside single quotes).
 */
function extractGrantedRoles(sql) {
  // Remove single-quoted string literals to avoid matching inside format('GRANT...')
  const noStrings = sql.replace(/'(?:[^']|'')*'/g, "''");
  const clean = stripLineComments(noStrings);

  const results = [];
  // Match bare GRANT ... TO <roles> (not inside a string or comment)
  const grantRe =
    /\bGRANT\b[^;]*?\bTO\b\s+((?:"?[a-zA-Z0-9_]+"?(?:\s*,\s*"?[a-zA-Z0-9_]+"?)*)\s*)/gi;
  let match;
  while ((match = grantRe.exec(clean)) !== null) {
    const roleList = match[1];
    for (const raw of roleList.split(",")) {
      const role = raw.trim().replace(/^"|"$/g, "");
      if (role) results.push(role);
    }
  }
  return results;
}

/** Extract the numeric prefix from a migration filename like "0123_foo.sql" → 123. */
function migrationNum(filename) {
  const m = filename.match(/^(\d+)_/);
  return m ? parseInt(m[1], 10) : 0;
}

async function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fail(`migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  const allFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Only check new migrations (above baseline)
  const files = allFiles.filter((f) => migrationNum(f) > BASELINE_MIGRATION_NUM);

  if (files.length === 0) {
    console.log(
      `verify:migration-no-unknown-roles PASS — no new migrations above baseline ${BASELINE_MIGRATION_NUM} to check`
    );
    return;
  }

  const violations = [];

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, "utf8");

    const roles = extractGrantedRoles(sql);
    for (const role of roles) {
      if (!ALLOWED_ROLES.has(role)) {
        violations.push({ file, role });
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      "verify:migration-no-unknown-roles FAIL — unknown roles in GRANT statements:\n"
    );
    for (const { file, role } of violations) {
      console.error(`  ${file}: GRANT ... TO "${role}"`);
      console.error(
        `    Role '${role}' does not exist on Neon. Use: ih35_app, neondb_owner`
      );
    }
    console.error(
      `\nAllowed roles: ${[...ALLOWED_ROLES].join(", ")}`
    );
    process.exit(1);
  }

  console.log(
    `verify:migration-no-unknown-roles PASS — ${files.length} new migration(s) above baseline ${BASELINE_MIGRATION_NUM} scanned, all GRANT roles are valid`
  );
}

main().catch((err) => fail(String(err?.message ?? err)));
