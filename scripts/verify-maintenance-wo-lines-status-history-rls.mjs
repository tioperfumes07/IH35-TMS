#!/usr/bin/env node
/**
 * Static guard for the P2 DB-audit RLS fix (locks the decision so it cannot silently regress):
 *
 *  maintenance.work_order_lines and maintenance.wo_status_history must both be RLS ENABLED + FORCED,
 *  with an isolate-through-parent (maintenance.work_orders.operating_company_id) tenant policy — the
 *  same shape as the accounting.bill_lines precedent (202606080040_...).
 *
 * Pure file-content checks against the held migration — no DB required. Safe to run in CI even though
 * the migration itself is HOLD-FOR-JORGE and has not been run anywhere yet.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MIGRATION = "db/migrations/202607110210_maintenance_wo_lines_status_history_rls.sql";

let failed = 0;
function fail(msg) {
  console.error(`verify-maintenance-wo-lines-status-history-rls: ${msg}`);
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
// explanatory prose in the migration's own header.
function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const migration = stripSqlComments(read(MIGRATION));
if (migration) {
  for (const table of ["maintenance.work_order_lines", "maintenance.wo_status_history"]) {
    const enableRe = new RegExp(`ALTER TABLE ${table.replace(".", "\\.")}\\s+ENABLE ROW LEVEL SECURITY`, "i");
    const forceRe = new RegExp(`ALTER TABLE ${table.replace(".", "\\.")}\\s+FORCE ROW LEVEL SECURITY`, "i");
    if (!enableRe.test(migration)) {
      fail(`${MIGRATION} must ENABLE ROW LEVEL SECURITY on ${table}.`);
    }
    if (!forceRe.test(migration)) {
      fail(`${MIGRATION} must FORCE ROW LEVEL SECURITY on ${table} (ENABLE alone does not bind the table owner / superuser-like roles).`);
    }
  }
  if (!/CREATE POLICY work_order_lines_company_isolation ON maintenance\.work_order_lines/i.test(migration)) {
    fail(`${MIGRATION} must create a tenant-isolation policy on maintenance.work_order_lines.`);
  }
  if (!/CREATE POLICY wo_status_history_company_isolation ON maintenance\.wo_status_history/i.test(migration)) {
    fail(`${MIGRATION} must create a tenant-isolation policy on maintenance.wo_status_history.`);
  }
  if (!/identity\.is_lucia_bypass\(\)/.test(migration)) {
    fail(`${MIGRATION} must include the identity.is_lucia_bypass() escape hatch (matches every other RLS policy in the repo).`);
  }
  if (!/FROM maintenance\.work_orders wo/i.test(migration)) {
    fail(`${MIGRATION} must isolate both child tables through the maintenance.work_orders parent (they carry no operating_company_id column of their own).`);
  }
}

if (failed) {
  process.exit(1);
}
console.log("verify-maintenance-wo-lines-status-history-rls: OK — both tables RLS ENABLE+FORCE with isolate-through-parent policy locked.");
