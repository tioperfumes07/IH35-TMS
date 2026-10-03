#!/usr/bin/env node
/**
 * ROUND 342 Class D (Cursor lane) — master-data codes are unique PER company, not globally.
 *
 * Static: migration 202615312200 drops customers_customer_code_key / vendors_vendor_code_key /
 * locations_location_code_key and creates uq_mdata_*_company_*_code.
 *
 * Live (DATABASE_URL, bypass_rls=lucia): assert the three company-scoped unique indexes exist
 * and the three global ones do not.
 */
export const ALLOW_OFFLINE_SKIP =
  "static migration contract always runs; live index proof needs DATABASE_URL after Neon apply";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const LABEL = "verify-r342-entity-code-company-scoped";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202615312200_r342_entity_code_company_scoped.sql";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(hay, needle, why) {
  if (!hay.includes(needle)) {
    console.error(`${LABEL}: FAIL — ${why}\n  missing: ${needle}`);
    process.exit(1);
  }
}

function selftest() {
  const mig = read(MIG);
  assertIncludes(mig, "DROP CONSTRAINT IF EXISTS customers_customer_code_key", "drop global customers code constraint");
  assertIncludes(mig, "DROP CONSTRAINT IF EXISTS vendors_vendor_code_key", "drop global vendors code constraint");
  assertIncludes(mig, "DROP CONSTRAINT IF EXISTS locations_location_code_key", "drop global locations code constraint");
  assertIncludes(mig, "uq_mdata_customers_company_customer_code", "company-scoped customers unique");
  assertIncludes(mig, "uq_mdata_vendors_company_vendor_code", "company-scoped vendors unique");
  assertIncludes(mig, "uq_mdata_locations_company_location_code", "company-scoped locations unique");
  assertIncludes(mig, "(operating_company_id, customer_code)", "customers key shape");
  assertIncludes(mig, "(operating_company_id, vendor_code)", "vendors key shape");
  assertIncludes(mig, "(operating_company_id, location_code)", "locations key shape");
  console.log(`${LABEL} selftest OK — migration scopes three code keys to operating_company_id`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  selftest();
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP live — no DATABASE_URL`);
    process.exit(0);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const { rows } = await client.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'mdata'
          AND tablename IN ('customers','vendors','locations')
          AND (
            indexname IN (
              'customers_customer_code_key','vendors_vendor_code_key','locations_location_code_key',
              'uq_mdata_customers_company_customer_code','uq_mdata_vendors_company_vendor_code',
              'uq_mdata_locations_company_location_code'
            )
          )
        ORDER BY indexname`
    );
    const names = new Set(rows.map((r) => r.indexname));
    const required = [
      "uq_mdata_customers_company_customer_code",
      "uq_mdata_vendors_company_vendor_code",
      "uq_mdata_locations_company_location_code",
    ];
    const forbidden = [
      "customers_customer_code_key",
      "vendors_vendor_code_key",
      "locations_location_code_key",
    ];
    const missing = required.filter((n) => !names.has(n));
    const stillGlobal = forbidden.filter((n) => names.has(n));
    if (missing.length || stillGlobal.length) {
      console.error(
        `${LABEL}: LIVE FAIL — missing=[${missing.join(",")}] still_global=[${stillGlobal.join(",")}] present=[${[...names].join(",")}]`
      );
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — company-scoped indexes present; global code keys gone (${[...names].join(", ")})`);
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`${LABEL}: FAIL`, err);
  process.exit(1);
});
