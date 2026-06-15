#!/usr/bin/env node
/**
 * Static guard for GAP-EXPENSES Phase 1 (locks two financial decisions so they
 * cannot silently regress):
 *
 *  1. Gate 2 — the expenses money path stays on the integer-cents spine.
 *     - the route must NOT reintroduce floating dollars (`amount_cents / 100`)
 *     - the route INSERT must target `total_amount_cents` (not `total_amount`)
 *     - the migration must define `total_amount_cents bigint`
 *
 *  2. void-not-delete — `ih35_app` must never hold DELETE on accounting.expenses.
 *     - the migration must explicitly `REVOKE DELETE ON accounting.expenses`
 *       (migration 0065 DEFAULT PRIVILEGES would otherwise auto-grant it)
 *     - the migration must not GRANT DELETE on accounting.expenses
 *
 * Pure file-content checks — no DB required. Safe to run in CI.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ROUTE = "apps/backend/src/accounting/expenses.routes.ts";
const MIGRATION = "db/migrations/202606151300_expenses_header_phase1_foundation.sql";

let failed = 0;
function fail(msg) {
  console.error(`verify-expenses-cents-and-void-not-delete: ${msg}`);
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

const route = read(ROUTE);
if (route) {
  if (/amount_cents\s*\/\s*100/.test(route)) {
    fail(`${ROUTE} reintroduces floating dollars (\`amount_cents / 100\`) — the expenses money path must stay on integer cents (Gate 2).`);
  }
  if (!/"total_amount_cents"/.test(route)) {
    fail(`${ROUTE} no longer writes \`total_amount_cents\` in the INSERT column list — the header total must be stored in integer cents (Gate 2).`);
  }
}

const migration = read(MIGRATION);
if (migration) {
  if (!/total_amount_cents\s+bigint/i.test(migration)) {
    fail(`${MIGRATION} must define \`total_amount_cents bigint\` (integer-cents header total, Gate 2).`);
  }
  if (!/REVOKE\s+DELETE\s+ON\s+accounting\.expenses\s+FROM\s+ih35_app/i.test(migration)) {
    fail(`${MIGRATION} must explicitly \`REVOKE DELETE ON accounting.expenses FROM ih35_app\` (void-not-delete; 0065 default privileges auto-grant DELETE otherwise).`);
  }
  if (/GRANT[^;]*\bDELETE\b[^;]*\bON\s+accounting\.expenses\b/i.test(migration)) {
    fail(`${MIGRATION} must not GRANT DELETE on accounting.expenses (void-not-delete).`);
  }
}

if (failed) {
  process.exit(1);
}
console.log("verify-expenses-cents-and-void-not-delete: OK — cents spine + void-not-delete locked.");
