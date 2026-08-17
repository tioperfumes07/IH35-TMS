#!/usr/bin/env node
/**
 * FINDING: LV-USMCA-TEST-FIXTURES-LIVE-IN-DRIVER-VENDOR-CUSTOMER-ROSTERS — found live 2026-08-16
 * while checking accounting:invoices-create-drawer and accounting:expenses-create-drawer. The
 * row-259 fix (202612700000) archived 7 test cash-advance GL accounts, but the same class of
 * ad-hoc test/audit-fixture data was live and ACTIVE in three more USMCA rosters that operators
 * pick from directly in production create-drawers: mdata.drivers (6), mdata.vendors (11),
 * mdata.customers (13) — fixture names DOMINATED the first page of the live invoice/expense
 * Customer and Vendor pickers. Fixed by migration
 * 202612710000_usmca_archive_test_driver_vendor_customer_fixtures.sql (archive, void-not-delete).
 *
 * Deliberately excluded from that migration, and from this guard: the "ZZ-SAMPLE ...
 * USMCA_GATEB_SAMPLE_2026-08-07" triad (2 customers + 1 vendor) — a real, still-in-use GATE-B
 * smoke fixture with live postings against it. This guard must never flag those three.
 *
 * Static check (always runs): the migration exists and its id lists are intact on disk.
 *
 * Live check (opt-in): scans mdata.drivers/vendors/customers for any ACTIVE (deactivated_at IS
 * NULL) row whose name matches an obvious test/audit-fixture pattern, excluding the three
 * GATE-B ids by name.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-no-active-test-fixtures";
const MIGRATION_REL = "db/migrations/202612710000_usmca_archive_test_driver_vendor_customer_fixtures.sql";

// A representative sample of the archived ids per table — enough to prove the migration's
// content is intact without hardcoding all 30 (the SQL body itself is the source of truth).
const SAMPLE_IDS = {
  drivers: "88c04cf5-9e32-455c-91e5-298a9b331b10", // Juan USMCA-Battery
  vendors: "2cbaf657-6aa1-4f6b-a54b-c1863e05162a", // P42-VENDOR-FK-20260811
  customers: "9e5f5eca-df4f-4f43-b8a5-6833bef01a9a", // CODEX-AUDIT-SPINE-20260816-0320
};

// \y = Postgres word boundary — "TEST" must not match inside a real name like "Testa".
const TEST_NAME_PATTERN = "\\yTEST\\y|\\ySAMPLE\\y|\\yCODEX\\y|GUARD-|CC1-|CC2-|CC3-|\\ySMOKE\\y|\\yBATTERY\\y|selftest|P23-|P42-";
const GATEB_EXCLUDED_NAME_FRAGMENT = "USMCA_GATEB_SAMPLE";
const USMCA_OPERATING_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertMigrationIntact(migrationSource) {
  const errors = [];
  if (!migrationSource.includes("UPDATE mdata.drivers")) {
    errors.push("migration no longer archives mdata.drivers");
  }
  if (!migrationSource.includes("UPDATE mdata.vendors")) {
    errors.push("migration no longer archives mdata.vendors");
  }
  if (!migrationSource.includes("UPDATE mdata.customers")) {
    errors.push("migration no longer archives mdata.customers");
  }
  if (!migrationSource.includes(SAMPLE_IDS.drivers)) {
    errors.push(`migration no longer archives driver id ${SAMPLE_IDS.drivers}`);
  }
  if (!migrationSource.includes(SAMPLE_IDS.vendors)) {
    errors.push(`migration no longer archives vendor id ${SAMPLE_IDS.vendors}`);
  }
  if (!migrationSource.includes(SAMPLE_IDS.customers)) {
    errors.push(`migration no longer archives customer id ${SAMPLE_IDS.customers}`);
  }
  return errors;
}

function selftest() {
  const problems = [];
  const live = read(MIGRATION_REL);

  const liveErrors = assertMigrationIntact(live);
  if (liveErrors.length) problems.push(`live migration rejected: ${liveErrors.join("; ")}`);

  const cases = [
    ["drivers block removed", live.replace("UPDATE mdata.drivers", "-- removed"), "no longer archives mdata.drivers"],
    ["vendors block removed", live.replace("UPDATE mdata.vendors", "-- removed"), "no longer archives mdata.vendors"],
    ["customers block removed", live.replace("UPDATE mdata.customers", "-- removed"), "no longer archives mdata.customers"],
    [
      "a sample driver id dropped",
      live.replace(SAMPLE_IDS.drivers, "00000000-0000-0000-0000-000000000000"),
      `no longer archives driver id ${SAMPLE_IDS.drivers}`,
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertMigrationIntact(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live migration clean; ${cases.length} planted regressions caught`);
}

async function liveScan() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live scan did NOT run`);
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    // Single multi-statement query — see ACCT-F5391: a pooled/transaction-pooling endpoint can hand
    // a separate client.query() call a different backend, silently dropping a bypass set in its own
    // call. SET + SELECT in one message guarantees one backend for both.
    const results = await client.query(
      `
        SELECT set_config('app.bypass_rls', 'lucia', true);
        SELECT 'driver' AS kind, id::text AS id, (first_name || ' ' || last_name) AS name
        FROM mdata.drivers
        WHERE operating_company_id = '${USMCA_OPERATING_COMPANY_ID}'
          AND deactivated_at IS NULL
          AND (first_name ~* '${TEST_NAME_PATTERN}' OR last_name ~* '${TEST_NAME_PATTERN}')
          AND (first_name || ' ' || last_name) NOT ILIKE '%${GATEB_EXCLUDED_NAME_FRAGMENT}%'
        UNION ALL
        SELECT 'vendor', id::text, vendor_name
        FROM mdata.vendors
        WHERE operating_company_id = '${USMCA_OPERATING_COMPANY_ID}'
          AND deactivated_at IS NULL
          AND vendor_name ~* '${TEST_NAME_PATTERN}'
          AND vendor_name NOT ILIKE '%${GATEB_EXCLUDED_NAME_FRAGMENT}%'
        UNION ALL
        SELECT 'customer', id::text, customer_name
        FROM mdata.customers
        WHERE operating_company_id = '${USMCA_OPERATING_COMPANY_ID}'
          AND deactivated_at IS NULL
          AND customer_name ~* '${TEST_NAME_PATTERN}'
          AND customer_name NOT ILIKE '%${GATEB_EXCLUDED_NAME_FRAGMENT}%';
      `
    );
    const res = Array.isArray(results) ? results[results.length - 1] : results;

    if (res.rows.length > 0) {
      const ids = res.rows.map((row) => `${row.kind}:${row.id} (${row.name})`).join(", ");
      console.error(`${LABEL} FAILED\n- ${res.rows.length} active test-fixture row(s) found live: ${ids}`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  console.log(`${LABEL} — OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertMigrationIntact(read(MIGRATION_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }

  await liveScan();
}

main().catch((error) => {
  console.error(`${LABEL} FAILED\n- ${String(error?.message ?? error)}`);
  process.exit(1);
});
