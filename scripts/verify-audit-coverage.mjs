#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_AUDIT_COVERAGE_ROOT ?? process.cwd();
const failures = [];

const migrationPath = path.resolve(ROOT, "db/migrations/0276_audit_triggers.sql");
const routePath = path.resolve(ROOT, "apps/backend/src/audit/audit.routes.ts");
const servicePath = path.resolve(ROOT, "apps/backend/src/audit/audit.service.ts");
const indexPath = path.resolve(ROOT, "apps/backend/src/index.ts");

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const migration = readIfExists(migrationPath);
if (!migration) failures.push("missing_migration_0276_audit_triggers");
if (!migration.includes("CREATE TABLE IF NOT EXISTS audit.row_changes")) failures.push("missing_audit_row_changes_table");
if (!migration.includes("CREATE OR REPLACE FUNCTION audit.tg_audit_row()")) failures.push("missing_tg_audit_row_function");
if (!migration.includes("CREATE OR REPLACE FUNCTION audit.ensure_row_trigger")) failures.push("missing_ensure_row_trigger_helper");

const requiredTargets = [
  "mdata.bills",
  "mdata.bill_lines",
  "mdata.bill_payments",
  "mdata.work_orders",
  "mdata.work_order_lines",
  "maintenance.work_orders",
  "maintenance.work_order_lines",
  "maint.part",
  "maint.pm_schedule",
  "mdata.fuel_entries",
  "dispatch.loads",
  "dispatch.load_status_history",
  "mdata.loads",
  "mdata.load_status_history",
  "accounting.bank_transactions",
  "banking.bank_transactions",
  "accounting.journal_entries",
  "insurance.policy",
  "insurance.policy_covered_unit",
  "insurance.policy_claim_link",
  "accounting.bills",
  "accounting.bill_lines",
  "accounting.bill_payments",
  "accounting.invoices",
];

for (const target of requiredTargets) {
  const [schema, table] = target.split(".");
  const call = `SELECT audit.ensure_row_trigger('${schema}', '${table}')`;
  if (!migration.includes(call)) failures.push(`missing_trigger_attach_call_${target}`);
}

if (!migration.includes("GRANT SELECT ON audit.row_changes TO ih35_app")) failures.push("missing_audit_row_changes_select_grant");
if (!migration.includes("CREATE POLICY audit_row_changes_tenant_scope")) failures.push("missing_audit_row_changes_rls_policy");

const routeSource = readIfExists(routePath);
if (!routeSource.includes('app.get("/api/v1/audit/row-changes"')) failures.push("missing_audit_read_route");

const serviceSource = readIfExists(servicePath);
if (!serviceSource.includes("FROM audit.row_changes")) failures.push("missing_audit_row_changes_query");

const indexSource = readIfExists(indexPath);
if (!indexSource.includes("registerAuditRoutes")) failures.push("missing_register_audit_routes_bootstrap");

if (failures.length > 0) {
  console.error("verify:audit-coverage FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:audit-coverage OK");
