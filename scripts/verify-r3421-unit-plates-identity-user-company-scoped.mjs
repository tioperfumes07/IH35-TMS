#!/usr/bin/env node
/**
 * ROUND 342.1 — company-scope unit_plates / equipment_plates / drivers.identity_user_id.
 *
 * Owner: one person CAN hold a driver row in two carriers → partial UNIQUE(oci, identity_user_id).
 * unit_plates / equipment_plates: live TRK↔USMCA — active plate unique must include operating_company_id.
 * samsara_driver_id: DO NOT TOUCH (Class B allow-list).
 */
export const ALLOW_OFFLINE_SKIP =
  "static migration contract always runs; live index proof needs DATABASE_URL after Neon apply";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const LABEL = "verify-r3421-unit-plates-identity-user-company-scoped";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202615312300_r3421_unit_plates_identity_user_company_scoped.sql";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(hay, needle, why) {
  if (!hay.includes(needle)) {
    console.error(`${LABEL}: FAIL — ${why}\n  missing: ${needle}`);
    process.exit(1);
  }
}

function assertNotIncludes(hay, needle, why) {
  if (hay.includes(needle)) {
    console.error(`${LABEL}: FAIL — ${why}\n  forbidden: ${needle}`);
    process.exit(1);
  }
}

function selftest() {
  const mig = read(MIG);
  assertIncludes(mig, "DROP CONSTRAINT IF EXISTS drivers_identity_user_id_key", "drop global identity_user unique");
  assertIncludes(mig, "uq_mdata_drivers_company_identity_user", "company-scoped identity_user unique");
  assertIncludes(mig, "(operating_company_id, identity_user_id)", "identity key shape");
  assertIncludes(mig, "WHERE identity_user_id IS NOT NULL", "nulls unconstrained");
  assertIncludes(mig, "uq_mdata_unit_plates_company_active", "company-scoped unit plates");
  assertIncludes(mig, "(operating_company_id, unit_id, country, jurisdiction)", "unit plates key shape");
  assertIncludes(mig, "uq_mdata_equipment_plates_company_active", "company-scoped equipment plates");
  assertIncludes(mig, "(operating_company_id, equipment_id, country, jurisdiction)", "equipment plates key shape");
  assertNotIncludes(mig, "driver_samsara_accounts", "must not touch samsara mapping table");
  assertNotIncludes(mig, "DROP INDEX IF EXISTS mdata.driver_samsara", "must not drop samsara unique");
  assertNotIncludes(mig, "DROP CONSTRAINT IF EXISTS driver_samsara", "must not drop samsara constraint");
  console.log(`${LABEL} selftest OK — plates + identity_user company-scoped; samsara untouched`);
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
          AND indexname IN (
            'drivers_identity_user_id_key',
            'uq_mdata_drivers_company_identity_user',
            'uq_unit_plates_active',
            'uq_mdata_unit_plates_company_active',
            'uq_eq_plates_active',
            'uq_mdata_equipment_plates_company_active'
          )
        ORDER BY 1`
    );
    const names = new Set(rows.map((r) => r.indexname));
    const required = [
      "uq_mdata_drivers_company_identity_user",
      "uq_mdata_unit_plates_company_active",
      "uq_mdata_equipment_plates_company_active",
    ];
    const forbidden = ["drivers_identity_user_id_key", "uq_unit_plates_active", "uq_eq_plates_active"];
    const missing = required.filter((n) => !names.has(n));
    const still = forbidden.filter((n) => names.has(n));
    if (missing.length || still.length) {
      console.error(`${LABEL}: LIVE FAIL — missing=[${missing}] still_global=[${still}] present=[${[...names]}]`);
      process.exit(1);
    }
    // samsara unique must still exist
    const sam = await client.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname='mdata' AND indexname='driver_samsara_accounts_samsara_driver_id_key'`
    );
    if (!sam.rows[0]) {
      console.error(`${LABEL}: LIVE FAIL — samsara_driver_id unique missing (must NOT have been dropped)`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — company-scoped plates+identity present; globals gone; samsara unique intact (${[...names].join(", ")})`);
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
