#!/usr/bin/env node
import dotenv from "dotenv";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("FAIL: Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const REQUIRED_TABLES = [
  ["accounting", "posting_batches"],
  ["accounting", "transaction_source_links"],
  ["accounting", "expense_category_account_map"],
  ["accounting", "chart_of_accounts_roles"],
  ["accounting", "sales_tax_agencies"],
  ["accounting", "sales_tax_returns"],
  ["factor", "reconciliation_runs"],
  ["factor", "reconciliation_items"],
  ["bank", "reconciliation_matches"],
  ["qbo", "sync_runs"],
  ["qbo", "sync_alerts"],
];

const REQUIRED_COLUMNS = [
  ["accounting", "posting_batches", "idempotency_key"],
  ["accounting", "posting_batches", "source_transaction_type"],
  ["accounting", "posting_batches", "source_transaction_id"],
  ["accounting", "transaction_source_links", "journal_entry_posting_id"],
  ["accounting", "transaction_source_links", "linked_object_type"],
  ["accounting", "transaction_source_links", "linked_object_id"],
  ["accounting", "expense_category_account_map", "category_kind"],
  ["accounting", "expense_category_account_map", "category_code"],
  ["accounting", "expense_category_account_map", "account_id"],
  ["accounting", "chart_of_accounts_roles", "role"],
  ["accounting", "chart_of_accounts_roles", "account_id"],
  ["accounting", "sales_tax_agencies", "agency_vendor_id"],
  ["accounting", "sales_tax_returns", "tax_owed_cents"],
  ["accounting", "sales_tax_returns", "status"],
  ["factor", "reconciliation_runs", "statement_date"],
  ["factor", "reconciliation_runs", "status"],
  ["factor", "reconciliation_items", "ledger_match_state"],
  ["factor", "reconciliation_items", "variance_cents"],
  ["bank", "reconciliation_matches", "match_state"],
  ["bank", "reconciliation_matches", "ledger_entry_kind"],
  ["qbo", "sync_runs", "status"],
  ["qbo", "sync_runs", "retry_count"],
  ["qbo", "sync_runs", "next_retry_at"],
  ["qbo", "sync_runs", "dead_letter_at"],
  ["qbo", "sync_alerts", "severity"],
  ["qbo", "sync_alerts", "error_code"],
];

function key(parts) {
  return parts.join(".");
}

function repoMigrationFiles() {
  const dir = path.join(process.cwd(), "db", "migrations");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d{4}[a-z]?_.+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();

  const repoMigrations = repoMigrationFiles();
  const ledgerRes = await client.query(`
    SELECT 'system'::text AS ledger, filename::text AS migration
    FROM _system._schema_migrations
    UNION ALL
    SELECT 'app'::text AS ledger, name::text AS migration
    FROM ih35_migrations.applied_migrations
  `);
  const sys = new Set(ledgerRes.rows.filter((r) => r.ledger === "system").map((r) => String(r.migration)));
  const app = new Set(ledgerRes.rows.filter((r) => r.ledger === "app").map((r) => String(r.migration)));
  const missing = repoMigrations.filter((m) => !sys.has(m) || !app.has(m));
  if (missing.length > 0) {
    console.error(`FAIL: live DB migration ledger missing ${missing.length} repo migrations`);
    for (const migration of missing.slice(0, 20)) {
      console.error(`- ${migration} (system=${sys.has(migration)}, app=${app.has(migration)})`);
    }
    process.exit(1);
  }
  console.log(`PASS: migration ledgers aligned (${repoMigrations.length} files)`);

  const tablesRes = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
  `);
  const tables = new Set(tablesRes.rows.map((r) => key([r.table_schema, r.table_name])));
  const missingTables = REQUIRED_TABLES.filter(([schema, table]) => !tables.has(key([schema, table])));
  if (missingTables.length > 0) {
    for (const [schema, table] of missingTables) {
      console.error(`FAIL: missing table ${schema}.${table}`);
    }
    process.exit(1);
  }
  console.log(`PASS: required tables present (${REQUIRED_TABLES.length})`);

  const colsRes = await client.query(`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
  `);
  const cols = new Set(colsRes.rows.map((r) => key([r.table_schema, r.table_name, r.column_name])));
  const missingColumns = REQUIRED_COLUMNS.filter(([schema, table, column]) => !cols.has(key([schema, table, column])));
  if (missingColumns.length > 0) {
    for (const [schema, table, column] of missingColumns) {
      console.error(`FAIL: missing column ${schema}.${table}.${column}`);
    }
    process.exit(1);
  }
  console.log(`PASS: required columns present (${REQUIRED_COLUMNS.length})`);

  const rlsRes = await client.query(
    `
      SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND (n.nspname, c.relname) IN (
          ('accounting','posting_batches'),
          ('accounting','transaction_source_links'),
          ('accounting','expense_category_account_map'),
          ('accounting','chart_of_accounts_roles'),
          ('factor','reconciliation_runs'),
          ('factor','reconciliation_items'),
          ('bank','reconciliation_matches'),
          ('qbo','sync_runs'),
          ('qbo','sync_alerts')
        )
    `,
  );
  const disabled = rlsRes.rows.filter((row) => !row.rls_enabled);
  if (disabled.length > 0) {
    for (const row of disabled) {
      console.error(`FAIL: RLS disabled on ${row.schema_name}.${row.table_name}`);
    }
    process.exit(1);
  }
  console.log(`PASS: RLS enabled on live-schema critical tables (${rlsRes.rows.length})`);

  console.log("PASS: db:verify:live-schema");
} catch (error) {
  console.error(`FAIL: db:verify:live-schema -> ${String(error?.message ?? error)}`);
  process.exit(1);
} finally {
  await client.end();
}
