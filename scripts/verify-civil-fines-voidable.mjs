#!/usr/bin/env node
/**
 * Static guard for the P2 DB-audit civil-fines fix (locks the decision so it cannot silently regress):
 *
 *  1. void-not-delete — safety.civil_fines must have voided_at + voided_reason columns, a status CHECK
 *     that allows 'voided', and `ih35_app` must NOT hold DELETE (0065's schema-wide default privileges
 *     would otherwise re-grant it — this is the exact gap this migration closes).
 *
 * Pure file-content checks against the held migration — no DB required. Safe to run in CI even though
 * the migration itself is HOLD-FOR-JORGE and has not been run anywhere yet.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MIGRATION = "db/migrations/202607090100_civil_fines_voidable.sql";

let failed = 0;
function fail(msg) {
  console.error(`verify-civil-fines-voidable: ${msg}`);
  failed = 1;
}
function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`expected file is missing: ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

// Strip SQL line-comments before matching so this guard checks executable SQL only — not the
// explanatory prose in the migration's own header (which quotes GRANT/REVOKE snippets for context
// and would otherwise false-positive against a naive regex).
function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const migration = stripSqlComments(read(MIGRATION));
if (migration) {
  if (!/ADD COLUMN IF NOT EXISTS voided_at\s+timestamptz/i.test(migration)) {
    fail(`${MIGRATION} must add \`voided_at timestamptz\` to safety.civil_fines (void-not-delete).`);
  }
  if (!/ADD COLUMN IF NOT EXISTS voided_reason\s+text/i.test(migration)) {
    fail(`${MIGRATION} must add \`voided_reason text\` to safety.civil_fines (void-not-delete).`);
  }
  if (!/CHECK\s*\(status IN \([^)]*'voided'[^)]*\)\)/i.test(migration)) {
    fail(`${MIGRATION} must widen the status CHECK constraint to allow 'voided' — otherwise the new columns can never be legally used.`);
  }
  if (!/REVOKE\s+DELETE\s+ON\s+safety\.civil_fines\s+FROM\s+ih35_app/i.test(migration)) {
    fail(`${MIGRATION} must explicitly \`REVOKE DELETE ON safety.civil_fines FROM ih35_app\` (void-not-delete; 0065 schema-wide default privileges grant DELETE on all of \`safety.*\` otherwise).`);
  }
  if (/GRANT[^;]*\bDELETE\b[^;]*\bON\s+safety\.civil_fines\b/i.test(migration)) {
    fail(`${MIGRATION} must not (re-)GRANT DELETE on safety.civil_fines (void-not-delete).`);
  }
}

if (failed) {
  process.exit(1);
}
console.log("verify-civil-fines-voidable: OK — civil_fines void-not-delete locked (voided_at/voided_reason + status CHECK + DELETE revoked).");
