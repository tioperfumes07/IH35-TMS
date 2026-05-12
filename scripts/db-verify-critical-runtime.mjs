import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("FAIL: Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const REQUIRED_TABLES = [
  ["mdata", "loads"],
  ["mdata", "customers"],
  ["mdata", "drivers"],
  ["qbo_archive", "import_batches"],
  ["qbo_archive", "import_batch_audit_log"],
  ["integrations", "qbo_connections"],
  ["integrations", "qbo_sync_queue"],
  ["dispatch", "load_id_reservations"],
  ["catalogs", "company_violation_types"],
  ["docs", "files"],
  ["identity", "users"],
];

const REQUIRED_COLUMNS = [
  ["mdata", "loads", "team_id"],
  ["mdata", "customers", "fmcsa_last_checked_at"],
  ["mdata", "customers", "fmcsa_check_response"],
  ["mdata", "drivers", "operating_company_id"],
  ["mdata", "drivers", "qbo_vendor_id"],
  ["mdata", "drivers", "qbo_vendor_linked_at"],
  ["mdata", "drivers", "qbo_vendor_linked_by_user_id"],
  ["qbo_archive", "import_batches", "operating_company_id"],
  ["qbo_archive", "import_batches", "qbo_realm_id"],
  ["qbo_archive", "import_batches", "status"],
  ["qbo_archive", "import_batches", "last_error_message"],
  ["qbo_archive", "import_batch_audit_log", "batch_id"],
  ["qbo_archive", "import_batch_audit_log", "event_type"],
  ["qbo_archive", "import_batch_audit_log", "occurred_at"],
  ["integrations", "qbo_connections", "operating_company_id"],
  ["integrations", "qbo_connections", "realm_id"],
  ["integrations", "qbo_connections", "access_token"],
  ["integrations", "qbo_connections", "refresh_token"],
  ["integrations", "qbo_sync_queue", "operating_company_id"],
  ["integrations", "qbo_sync_queue", "entity_type"],
  ["integrations", "qbo_sync_queue", "entity_id"],
  ["integrations", "qbo_sync_queue", "sync_status"],
  ["integrations", "qbo_sync_queue", "next_attempt_at"],
  ["dispatch", "load_id_reservations", "operating_company_id"],
  ["dispatch", "load_id_reservations", "reserved_load_number"],
  ["dispatch", "load_id_reservations", "reserved_by_user_id"],
  ["dispatch", "load_id_reservations", "status"],
  ["dispatch", "load_id_reservations", "expires_at"],
  ["catalogs", "company_violation_types", "operating_company_id"],
  ["catalogs", "company_violation_types", "type_code"],
  ["catalogs", "company_violation_types", "type_name"],
  ["catalogs", "company_violation_types", "default_fine_amount_cents"],
  ["docs", "files", "dispatch_load_id"],
  ["docs", "files", "dispatch_document_channel"],
  ["docs", "files", "dispatch_delivery_status"],
  ["docs", "files", "dispatch_external_message_id"],
  ["docs", "files", "dispatch_generated_at"],
  ["identity", "users", "email"],
  ["identity", "users", "role"],
];

function key(parts) {
  return parts.join(".");
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();

  const tableRows = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE';
  `);
  const existingTables = new Set(tableRows.rows.map((row) => key([row.table_schema, row.table_name])));

  const missingTables = REQUIRED_TABLES.filter(([schema, table]) => !existingTables.has(key([schema, table])));
  if (missingTables.length > 0) {
    for (const [schema, table] of missingTables) {
      console.error(`FAIL: missing table ${schema}.${table}`);
    }
    process.exit(1);
  }
  console.log(`PASS: required tables present (${REQUIRED_TABLES.length})`);

  const colRows = await client.query(`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns;
  `);
  const existingColumns = new Set(colRows.rows.map((row) => key([row.table_schema, row.table_name, row.column_name])));
  const missingColumns = REQUIRED_COLUMNS.filter(
    ([schema, table, column]) => !existingColumns.has(key([schema, table, column]))
  );
  if (missingColumns.length > 0) {
    for (const [schema, table, column] of missingColumns) {
      console.error(`FAIL: missing column ${schema}.${table}.${column}`);
    }
    process.exit(1);
  }
  console.log(`PASS: required columns present (${REQUIRED_COLUMNS.length})`);

  const ownerRes = await client.query(`
    SELECT count(*)::int AS owner_count
    FROM identity.users
    WHERE role = 'Owner'::identity.role_enum;
  `);
  const ownerCount = ownerRes.rows[0]?.owner_count ?? 0;
  if (ownerCount < 1) {
    console.error("FAIL: expected at least 1 Owner in identity.users");
    process.exit(1);
  }
  console.log(`PASS: owner count is ${ownerCount}`);
  console.log("PASS: db-verify-critical-runtime");
} catch (error) {
  console.error(`FAIL: db-verify-critical-runtime -> ${String(error.message || error)}`);
  process.exit(1);
} finally {
  await client.end();
}
