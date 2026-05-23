#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "db/migrations/0217_accounting_period_cash_basis_snapshot.sql");
const snapshotServicePath = path.join(process.cwd(), "apps/backend/src/accounting/cash-basis/snapshot.service.ts");
const closeWriterPath = path.join(process.cwd(), "apps/backend/src/accounting/cash-basis/period-close-snapshot.service.ts");

function fail(messages) {
  console.error("verify:period-cash-basis-snapshot-shape — FAILED");
  for (const msg of messages) console.error(`- ${msg}`);
  process.exit(1);
}

const failures = [];

if (!fs.existsSync(migrationPath)) {
  failures.push(`missing migration: ${migrationPath}`);
} else {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const requiredSqlChecks = [
    /CREATE TABLE IF NOT EXISTS accounting\.period_cash_basis_snapshot/i,
    /operating_company_id uuid NOT NULL REFERENCES org\.companies\(id\)/i,
    /period_id uuid NOT NULL REFERENCES accounting\.periods\(id\)/i,
    /snapshot_payload jsonb NOT NULL DEFAULT '\{\}'::jsonb/i,
    /computed_at timestamptz NOT NULL DEFAULT now\(\)/i,
    /computed_by_user_uuid uuid REFERENCES identity\.users\(id\)/i,
    /UNIQUE\s*\(\s*operating_company_id,\s*period_id\s*\)/i,
    /ENABLE ROW LEVEL SECURITY/i,
    /CREATE POLICY period_cash_basis_snapshot_company_scope/i,
  ];
  for (const pattern of requiredSqlChecks) {
    if (!pattern.test(sql)) failures.push(`migration missing required clause: ${pattern}`);
  }
}

if (!fs.existsSync(snapshotServicePath)) {
  failures.push(`missing snapshot service: ${snapshotServicePath}`);
} else {
  const source = fs.readFileSync(snapshotServicePath, "utf8");
  const requiredSourceChecks = [
    /findClosedPeriodForDate/,
    /readPeriodCashBasisSnapshot/,
    /FROM accounting\.period_cash_basis_snapshot/,
  ];
  for (const pattern of requiredSourceChecks) {
    if (!pattern.test(source)) failures.push(`snapshot service missing required logic: ${pattern}`);
  }
}

if (!fs.existsSync(closeWriterPath)) {
  failures.push(`missing close-time snapshot writer: ${closeWriterPath}`);
} else {
  const source = fs.readFileSync(closeWriterPath, "utf8");
  const requiredWriterChecks = [
    /writePeriodCashBasisSnapshotAtClose/,
    /INSERT INTO accounting\.period_cash_basis_snapshot/,
    /ON CONFLICT \(operating_company_id, period_id\) DO NOTHING/,
  ];
  for (const pattern of requiredWriterChecks) {
    if (!pattern.test(source)) failures.push(`close-time writer missing required logic: ${pattern}`);
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:period-cash-basis-snapshot-shape — OK");
