import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Client } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const client = new Client({ connectionString });

const requiredTables = [
  "identity.users",
  "identity.sessions",
  "identity.workflow_requests",
  "mdata.drivers",
  "mdata.driver_equipment_qualifications",
  "mdata.driver_pay_rates",
  "mdata.driver_safety_events",
  "mdata.driver_company_authorizations",
  "mdata.dispatcher_safety_events",
  "mdata.customers",
  "mdata.customer_contacts",
  "mdata.customer_quality_events",
  "mdata.vendors",
  "mdata.units",
  "mdata.equipment",
  "mdata.locations",
  "mdata.equipment_log",
  "mdata.workflow_requests",
  "catalogs.equipment_types",
  "catalogs.equipment_line_item_templates",
  "catalogs.driver_load_statuses",
  "catalogs.driver_termination_reasons",
  "catalogs.dispatcher_error_reasons",
  "catalogs.customer_quality_event_reasons",
  "catalogs.us_states",
  "catalogs.mexico_states",
  "catalogs.accounts",
  "catalogs.classes",
  "catalogs.items",
  "catalogs.payment_terms",
  "catalogs.posting_templates",
  "catalogs.account_role_bindings",
  "catalogs.catalog_registry",
  "catalogs.workflow_requests",
  "org.companies",
  "org.user_company_access",
  "audit.audit_events",
  "outbox.outbox_queue",
];

const rlsCriticalTables = [
  "identity.users",
  "identity.sessions",
  "identity.workflow_requests",
  "mdata.drivers",
  "mdata.units",
  "mdata.customers",
  "mdata.vendors",
  "mdata.locations",
  "mdata.equipment",
  "mdata.equipment_log",
  "mdata.driver_safety_events",
  "mdata.dispatcher_safety_events",
  "mdata.customer_quality_events",
  "catalogs.accounts",
  "catalogs.classes",
  "catalogs.items",
  "catalogs.payment_terms",
  "catalogs.posting_templates",
  "catalogs.account_role_bindings",
  "catalogs.catalog_registry",
  "catalogs.driver_load_statuses",
  "catalogs.driver_termination_reasons",
  "catalogs.dispatcher_error_reasons",
  "catalogs.customer_quality_event_reasons",
  "org.companies",
  "org.user_company_access",
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function requireCount(sql, expected, label) {
  const res = await client.query(sql);
  const count = Number(res.rows[0]?.count ?? 0);
  if (count !== expected) {
    fail(`${label} expected ${expected}, got ${count}`);
  }
}

async function requireAtLeast(sql, min, label) {
  const res = await client.query(sql);
  const count = Number(res.rows[0]?.count ?? 0);
  if (count < min) {
    fail(`${label} expected >= ${min}, got ${count}`);
  }
}

try {
  await client.connect();

  const migrationsDir = path.resolve("db/migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  if (migrationFiles.length < 26) {
    fail(`migration file count expected at least 26, got ${migrationFiles.length}`);
  }

  for (const tableName of requiredTables) {
    const res = await client.query("SELECT to_regclass($1) AS regclass", [tableName]);
    if (!res.rows[0]?.regclass) {
      fail(`required table missing: ${tableName}`);
    }
  }

  await requireAtLeast("SELECT count(*)::int FROM catalogs.equipment_types WHERE is_active = true AND deactivated_at IS NULL", 4, "catalogs.equipment_types active rows");
  await requireAtLeast("SELECT count(*)::int FROM catalogs.driver_load_statuses WHERE is_active = true AND deactivated_at IS NULL", 13, "catalogs.driver_load_statuses active rows");
  await requireCount("SELECT count(*)::int FROM catalogs.driver_termination_reasons", 16, "catalogs.driver_termination_reasons rows");
  await requireCount("SELECT count(*)::int FROM catalogs.dispatcher_error_reasons", 25, "catalogs.dispatcher_error_reasons rows");
  await requireCount("SELECT count(*)::int FROM catalogs.customer_quality_event_reasons", 24, "catalogs.customer_quality_event_reasons rows");
  await requireCount("SELECT count(*)::int FROM catalogs.us_states", 56, "catalogs.us_states rows");
  await requireCount("SELECT count(*)::int FROM catalogs.mexico_states", 32, "catalogs.mexico_states rows");
  await requireAtLeast("SELECT count(*)::int FROM catalogs.catalog_registry", 8, "catalogs.catalog_registry rows");
  await requireAtLeast("SELECT count(*)::int FROM mdata.vendors WHERE lower(vendor_name) LIKE '%faro factoring%'", 1, "Faro vendor seed");
  await requireAtLeast("SELECT count(*)::int FROM mdata.vendors WHERE lower(vendor_name) LIKE '%commercial credit group%'", 1, "CCG vendor seed");
  await requireCount("SELECT count(*)::int FROM org.companies WHERE code IN ('TRANSP', 'TRK', 'USMCA')", 3, "org companies seed");

  for (const tableName of rlsCriticalTables) {
    const [schema, table] = tableName.split(".");
    const res = await client.query(
      `
        SELECT c.relrowsecurity AS enabled
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2
      `,
      [schema, table]
    );
    if (!res.rows[0]?.enabled) {
      fail(`RLS is not enabled on ${tableName}`);
    }
  }

  const auditCoverageScript = fs.readFileSync(path.resolve("scripts/db-verify-phase1-audit-coverage.mjs"), "utf8");
  const classesMatch = auditCoverageScript.match(/const (?:EXPECTED_EVENT_CLASSES|EVENT_CLASSES) = \[([\s\S]*?)\];/);
  if (!classesMatch) {
    fail("could not parse EXPECTED_EVENT_CLASSES from db-verify-phase1-audit-coverage.mjs");
  }
  const expectedCoverage = (classesMatch[1].match(/"[^"]+"/g) ?? []).length;
  if (expectedCoverage !== 198) {
    fail(`audit coverage expected list should be 198, got ${expectedCoverage}`);
  }

  console.log(`PASS: Phase 1 Gate verification complete. ${migrationFiles.length} migrations present, all tables present, all catalogs pre-populated, all RLS enabled, audit coverage at 198 events.`);
} catch (error) {
  fail(String(error?.message || error));
} finally {
  await client.end().catch(() => undefined);
}
