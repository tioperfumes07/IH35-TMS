#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`verify:no-test-seed-in-prod-listings FAIL: ${message}`);
  process.exit(1);
}

function assertRouteFilters() {
  const driversPath = path.join(ROOT, "apps/backend/src/mdata/drivers.routes.ts");
  const mdataCustomersPath = path.join(ROOT, "apps/backend/src/mdata/customers.routes.ts");
  const qboCustomersPath = path.join(ROOT, "apps/backend/src/accounting/qbo-master-read.routes.ts");
  const usersPath = path.join(ROOT, "apps/backend/src/identity/users.routes.ts");

  for (const target of [driversPath, mdataCustomersPath, qboCustomersPath, usersPath]) {
    if (!fs.existsSync(target)) fail(`missing ${path.relative(ROOT, target)}`);
  }

  const driversSrc = fs.readFileSync(driversPath, "utf8");
  const mdataCustomersSrc = fs.readFileSync(mdataCustomersPath, "utf8");
  const qboCustomersSrc = fs.readFileSync(qboCustomersPath, "utf8");
  const usersSrc = fs.readFileSync(usersPath, "utf8");

  if (!driversSrc.includes("EXCLUDE_ARCHIVED_DRIVERS_SQL")) {
    fail("drivers list route must filter archived test/seed rows");
  }
  if (!mdataCustomersSrc.includes("EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL")) {
    fail("mdata customers list route must filter archived test/seed rows");
  }
  if (!qboCustomersSrc.includes("EXCLUDE_ARCHIVED_QBO_CUSTOMERS_SQL")) {
    fail("accounting customers list route must filter archived test/seed rows");
  }
  if (!usersSrc.includes("EXCLUDE_ARCHIVED_IDENTITY_USERS_SQL")) {
    fail("identity users list route must filter archived test/seed rows");
  }
}

async function assertDatabaseListings() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("verify:no-test-seed-in-prod-listings SKIP (DATABASE_URL unset)");
    return;
  }

  const pool = new pg.Pool({ connectionString });
  try {
    const checks = [
      {
        label: "mdata.drivers",
        sql: `
          SELECT id::text, COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') AS label
          FROM mdata.drivers
          WHERE archived_at IS NULL
            AND (
              first_name ILIKE 'TEST-%' OR last_name ILIKE 'TEST-%'
              OR first_name ILIKE 'seed-%' OR last_name ILIKE 'seed-%'
              OR COALESCE(email, '') ILIKE '%@seed.invalid'
              OR COALESCE(email, '') ILIKE 'seed-test-%'
            )
          LIMIT 5
        `,
      },
      {
        label: "mdata.customers",
        sql: `
          SELECT id::text, customer_name AS label
          FROM mdata.customers
          WHERE archived_at IS NULL
            AND (customer_name ILIKE 'TEST-%' OR customer_name ILIKE 'seed-%'
              OR COALESCE(customer_code, '') ILIKE 'TEST-%' OR COALESCE(customer_code, '') ILIKE 'seed-%')
          LIMIT 5
        `,
      },
      {
        label: "mdata.qbo_customers",
        sql: `
          SELECT id::text, display_name AS label
          FROM mdata.qbo_customers
          WHERE archived_at IS NULL
            AND (display_name ILIKE 'TEST-%' OR display_name ILIKE 'seed-%')
          LIMIT 5
        `,
      },
      {
        label: "identity.users",
        sql: `
          SELECT id::text, email AS label
          FROM identity.users
          WHERE archived_at IS NULL
            AND (email ILIKE '%@seed.invalid' OR email ILIKE 'seed-test-%')
          LIMIT 5
        `,
      },
    ];

    for (const check of checks) {
      const reg = check.label.split(".")[0];
      const table = check.label.split(".")[1];
      const exists = await pool.query(`SELECT to_regclass($1) AS reg`, [check.label]);
      if (!exists.rows[0]?.reg) continue;

      const hasArchived = await pool.query(
        `
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2 AND column_name = 'archived_at'
          ) AS ok
        `,
        [reg, table]
      );
      if (!hasArchived.rows[0]?.ok) continue;

      const res = await pool.query(check.sql);
      if (res.rows.length > 0) {
        fail(`${check.label} still has visible test/seed rows: ${res.rows.map((r) => r.label).join(", ")}`);
      }
    }
  } finally {
    await pool.end();
  }
}

assertRouteFilters();
await assertDatabaseListings();
console.log("verify:no-test-seed-in-prod-listings PASS");
