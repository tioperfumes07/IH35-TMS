#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(lines) {
  console.error("verify:qbo-invoices-mirror-shape — FAILED");
  for (const line of lines) console.error(`- ${line}`);
  process.exit(1);
}

const migrationPath = path.join(ROOT, "db/migrations/0217_qbo_invoices_mirror_table.sql");
if (!fs.existsSync(migrationPath)) {
  fail(["db/migrations/0217_qbo_invoices_mirror_table.sql:1 migration file missing"]);
}

const text = fs.readFileSync(migrationPath, "utf8");
const failures = [];

if (!text.includes("CREATE TABLE IF NOT EXISTS mdata.qbo_invoices")) {
  failures.push("migration must create mdata.qbo_invoices");
}
if (!text.includes("operating_company_id UUID NOT NULL REFERENCES org.companies(id)")) {
  failures.push("table must include tenant FK operating_company_id -> org.companies");
}
if (!text.includes("invoice_id UUID NOT NULL REFERENCES accounting.invoices(id)")) {
  failures.push("table must include invoice FK to accounting.invoices");
}
if (!text.includes("sync_status TEXT NOT NULL")) {
  failures.push("table must include sync_status");
}
if (!text.includes("last_synced_at TIMESTAMPTZ")) {
  failures.push("table must include last_synced_at");
}
if (!text.includes("ALTER TABLE mdata.qbo_invoices ENABLE ROW LEVEL SECURITY")) {
  failures.push("migration must enable RLS");
}
if (!text.includes("GRANT SELECT, INSERT, UPDATE ON mdata.qbo_invoices TO ih35_app")) {
  failures.push("migration must include explicit grants for ih35_app");
}
if (!text.includes("qbo_invoices_sync_all")) {
  failures.push("migration must include bypass sync policy for outbox/bypass writers");
}

if (failures.length > 0) fail(failures);
console.log("verify:qbo-invoices-mirror-shape — OK");
