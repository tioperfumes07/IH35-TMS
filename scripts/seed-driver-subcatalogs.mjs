#!/usr/bin/env node
/**
 * DEPRECATED 2026-06-03 by A17.2.
 *
 * This script seeds the deprecated catalogs.driver_* tables.
 * Canonical seed lives in migration 0340 (reference.* + archived_at).
 * Do NOT run on new environments.
 *
 * Kept for ledger/archaeology per ARCHIVE-not-DELETE.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS + catalogs.__seed_company_catalog.
 */
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const { Client } = pg;

const TABLES = [
  "license_classes",
  "cdl_endorsements",
  "cdl_restrictions",
  "medical_card_statuses",
  "employment_statuses",
];

const SEEDS = {
  license_classes: [
    { code: "A", display_name: "Class A — Combination vehicle", sort_order: 10 },
    { code: "B", display_name: "Class B — Heavy straight vehicle", sort_order: 20 },
    { code: "C", display_name: "Class C — Small vehicle", sort_order: 30 },
    { code: "AM", display_name: "Class AM — Motorcycle", sort_order: 40 },
    { code: "BM", display_name: "Class BM — Motorcycle + Class B", sort_order: 50 },
    { code: "CM", display_name: "Class CM — Motorcycle + Class C", sort_order: 60 },
  ],
  cdl_endorsements: [
    { code: "H", display_name: "Hazardous materials", sort_order: 10 },
    { code: "N", display_name: "Tank vehicle", sort_order: 20 },
    { code: "P", display_name: "Passenger", sort_order: 30 },
    { code: "S", display_name: "School bus", sort_order: 40 },
    { code: "T", display_name: "Double/triple trailers", sort_order: 50 },
    { code: "X", display_name: "Tank + hazmat combination", sort_order: 60 },
  ],
  cdl_restrictions: [
    { code: "E", display_name: "No manual transmission", sort_order: 10 },
    { code: "L", display_name: "No air brake equipped CMV", sort_order: 20 },
    { code: "M", display_name: "Class B/C bus only", sort_order: 30 },
    { code: "N", display_name: "Class C passenger only", sort_order: 40 },
    { code: "O", display_name: "No tractor-trailer", sort_order: 50 },
    { code: "V", display_name: "Medical variance", sort_order: 60 },
    { code: "Z", display_name: "No full air brake", sort_order: 70 },
  ],
  medical_card_statuses: [
    { code: "VALID", display_name: "Valid", sort_order: 10 },
    { code: "EXPIRED", display_name: "Expired", sort_order: 20 },
    { code: "PENDING", display_name: "Pending review", sort_order: 30 },
    { code: "WAIVED", display_name: "Waived / exempt", sort_order: 40 },
  ],
  employment_statuses: [
    { code: "W2", display_name: "W-2 employee", sort_order: 10 },
    { code: "1099", display_name: "1099 contractor", sort_order: 20 },
    { code: "PROBATIONARY", display_name: "Probationary", sort_order: 30 },
    { code: "ACTIVE", display_name: "Active", sort_order: 40 },
    { code: "TERMINATED", display_name: "Terminated", sort_order: 50 },
    { code: "INACTIVE", display_name: "Inactive", sort_order: 60 },
  ],
};

async function ensureTables(client) {
  for (const tbl of TABLES) {
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS catalogs.${tbl} (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          operating_company_id uuid NOT NULL REFERENCES org.companies(id),
          code text NOT NULL,
          display_name text NOT NULL,
          description text,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          is_active boolean NOT NULL DEFAULT true,
          sort_order int NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (operating_company_id, code)
        )
      `
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_${tbl}_company_active ON catalogs.${tbl} (operating_company_id, is_active)`
    );
    await client.query(`ALTER TABLE catalogs.${tbl} ENABLE ROW LEVEL SECURITY`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.${tbl} TO ih35_app`);
    await client.query(`DROP POLICY IF EXISTS company_scope ON catalogs.${tbl}`);
    await client.query(
      `
        CREATE POLICY company_scope
        ON catalogs.${tbl}
        FOR ALL TO ih35_app
        USING (operating_company_id::text = current_setting('app.operating_company_id', true))
        WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true))
      `
    );
  }
}

async function seedCatalog(client, tableName, entries) {
  const payload = entries.map((row) => ({
    code: row.code,
    display_name: row.display_name,
    description: null,
    metadata: {},
    sort_order: row.sort_order,
  }));
  await client.query(`SELECT catalogs.__seed_company_catalog($1::text, $2::jsonb)`, [tableName, JSON.stringify(payload)]);
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("seed-driver-subcatalogs FAIL: DATABASE_URL not set");
    process.exit(1);
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    await client.query("BEGIN");
    await ensureTables(client);
    for (const tbl of TABLES) {
      await seedCatalog(client, tbl, SEEDS[tbl]);
      console.log(`seed-driver-subcatalogs: seeded catalogs.${tbl}`);
    }
    await client.query("COMMIT");
    console.log("seed-driver-subcatalogs PASS");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("seed-driver-subcatalogs FAIL:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
