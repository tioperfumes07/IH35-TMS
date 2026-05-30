import dotenv from "dotenv";
import pg from "pg";
import path from "node:path";
import { verifyMigrationContent } from "./lib/migration-content-verifier.mjs";

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
  ["integrations", "samsara_config"],
  ["integrations", "samsara_webhook_events"],
  ["dispatch", "load_id_reservations"],
  ["catalogs", "company_violation_types"],
  ["docs", "files"],
  ["documents", "attachments"],
  ["identity", "users"],
];

const REQUIRED_VIEWS = [["maintenance", "v_arriving_soon"]];

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
  ["integrations", "samsara_config", "operating_company_id"],
  ["integrations", "samsara_config", "is_enabled"],
  ["integrations", "samsara_config", "last_health_status"],
  ["integrations", "samsara_webhook_events", "operating_company_id"],
  ["integrations", "samsara_webhook_events", "event_type"],
  ["integrations", "samsara_webhook_events", "signature_valid"],
  ["integrations", "samsara_webhook_events", "payload"],
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

const REQUIRED_SCHEMA_USAGE = ["integrations", "qbo_archive", "dispatch", "catalogs", "maintenance", "documents"];

const REQUIRED_TABLE_SELECT_FOR_ROLE = [
  ["dispatch", "load_id_reservations"],
  ["catalogs", "company_violation_types"],
  ["integrations", "qbo_connections"],
  ["integrations", "qbo_sync_queue"],
  ["integrations", "samsara_config"],
  ["integrations", "samsara_webhook_events"],
  ["qbo_archive", "import_batches"],
  ["documents", "attachments"],
];

function key(parts) {
  return parts.join(".");
}

const verifyContent = process.argv.includes("--verify-content");

// Transient connection drops (common with serverless Postgres) should be
// retried rather than treated as a content failure. Real drift/missing-object
// failures are NOT in this set and continue to fail fast.
const TRANSIENT_CONNECTION_ERROR_PATTERNS = [
  /connection terminated/i,
  /econnreset/i,
  /etimedout/i,
  /timeout/i,
  /terminating connection/i,
  /server closed the connection/i,
  /connection error/i,
  /socket hang up/i,
];

function isTransientConnectionError(error) {
  const message = String(error?.message || error);
  return TRANSIENT_CONNECTION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

async function runVerification() {
  const client = new pg.Client({ connectionString });
  // Attach an error listener so a mid-query connection drop surfaces as a
  // catchable rejection instead of an unhandled 'error' event that crashes
  // the process before it can be classified and retried.
  client.on("error", () => {});

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

    const viewRows = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.views;
    `);
    const existingViews = new Set(viewRows.rows.map((row) => key([row.table_schema, row.table_name])));
    const missingViews = REQUIRED_VIEWS.filter(([schema, view]) => !existingViews.has(key([schema, view])));
    if (missingViews.length > 0) {
      for (const [schema, view] of missingViews) {
        console.error(`FAIL: missing view ${schema}.${view}`);
      }
      process.exit(1);
    }
    console.log(`PASS: required views present (${REQUIRED_VIEWS.length})`);

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

    // Content-drift verification runs on fresh CI databases with no seeded users.
    // Keep owner-role enforcement for runtime checks, but skip it when verify-content is requested.
    if (!verifyContent) {
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
    } else {
      console.log("PASS: owner-count runtime check skipped during --verify-content");
    }

    const missingSchemaUsage = [];
    for (const schema of REQUIRED_SCHEMA_USAGE) {
      const usageRes = await client.query(
        `
          SELECT has_schema_privilege('ih35_app', $1, 'USAGE') AS has_usage;
        `,
        [schema]
      );
      if (!usageRes.rows[0]?.has_usage) {
        missingSchemaUsage.push(schema);
      }
    }
    if (missingSchemaUsage.length > 0) {
      for (const schema of missingSchemaUsage) {
        console.error(`FAIL: ih35_app missing USAGE on schema ${schema}`);
      }
      process.exit(1);
    }
    console.log(`PASS: ih35_app schema USAGE present (${REQUIRED_SCHEMA_USAGE.length})`);

    const tableGrantRows = await client.query(
      `
        SELECT table_schema, table_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE grantee = 'ih35_app'
          AND privilege_type = 'SELECT';
      `
    );
    const tableSelectGrants = new Set(tableGrantRows.rows.map((row) => key([row.table_schema, row.table_name])));
    const missingTableSelect = REQUIRED_TABLE_SELECT_FOR_ROLE.filter(
      ([schema, table]) => !tableSelectGrants.has(key([schema, table]))
    );
    if (missingTableSelect.length > 0) {
      for (const [schema, table] of missingTableSelect) {
        console.error(`FAIL: ih35_app missing SELECT on ${schema}.${table}`);
      }
      process.exit(1);
    }
    console.log(`PASS: ih35_app table SELECT present (${REQUIRED_TABLE_SELECT_FOR_ROLE.length})`);

    if (verifyContent) {
      const contentReport = await verifyMigrationContent({
        client,
        migrationsDirectory: path.resolve("db/migrations"),
        minNumber: 1,
        maxNumber: Number.MAX_SAFE_INTEGER,
      });

      for (const migration of contentReport.report) {
        for (const skipped of migration.skipped ?? []) {
          console.log(
            `${skipped.reason}: migration ${migration.filename} declares ${skipped.kind}:${skipped.object} (${skipped.trace})`
          );
        }
      }

      if (contentReport.totalMissing > 0) {
        for (const migration of contentReport.report) {
          for (const missing of migration.missing) {
            const declaredObject =
              missing.fqcn ||
              missing.fqtn ||
              missing.fqvn ||
              missing.fqmvn ||
              missing.fqin ||
              missing.fqfn ||
              missing.key ||
              missing.fqtt ||
              JSON.stringify(missing);
            console.error(
              `DRIFT: migration ${migration.filename} declares ${missing.kind}:${declaredObject} but object not present in schema`
            );
          }
        }
        console.error(`FAIL: db-verify-critical-runtime --verify-content (missing=${contentReport.totalMissing})`);
        process.exit(1);
      }

      console.log(
        `PASS: migration content verified (${contentReport.migrationCount} files, missing=${contentReport.totalMissing}, skipped=${contentReport.totalSkipped ?? 0})`
      );
    }

    console.log("PASS: db-verify-critical-runtime");
  } finally {
    await client.end().catch(() => {});
  }
}

const MAX_ATTEMPTS = 3;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    await runVerification();
    break;
  } catch (error) {
    if (isTransientConnectionError(error) && attempt < MAX_ATTEMPTS) {
      console.warn(
        `WARN: db-verify-critical-runtime transient connection error (attempt ${attempt}/${MAX_ATTEMPTS}): ${String(
          error.message || error
        )} -- retrying`
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }
    console.error(`FAIL: db-verify-critical-runtime -> ${String(error.message || error)}`);
    process.exit(1);
  }
}
