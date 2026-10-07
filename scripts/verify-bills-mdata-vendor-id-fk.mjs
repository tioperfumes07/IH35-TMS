#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
// A-26 (Lead ruling r294d, 2026-09-30): accounting.bills.vendor_uuid is TEXT while mdata.vendors.id
// is UUID, forcing an explicit ::text cast at every join. accounting.bills.mdata_vendor_id is the
// already-populated, correctly-typed UUID column meant to replace it in new joins. This guard
// asserts the FK added in migration 202614770000_bills_mdata_vendor_id_fk.sql is actually live on
// prod -- a migration that ran once and was never re-checked is not a guarantee.
//
// Usage: node scripts/verify-bills-mdata-vendor-id-fk.mjs [--selftest]
import pg from "pg";

const LABEL = "verify-bills-mdata-vendor-id-fk";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";

export function findMissingFk(constraints) {
  const hasFk = constraints.some(
    (c) => c.column_name === "mdata_vendor_id" && c.f_table === "vendors" && c.f_col === "id"
  );
  return hasFk ? null : "no FOREIGN KEY from accounting.bills.mdata_vendor_id to mdata.vendors.id";
}

function selftest() {
  const withFk = [{ column_name: "mdata_vendor_id", f_table: "vendors", f_col: "id" }];
  if (findMissingFk(withFk) !== null) throw new Error("expected PASS when the FK is present");
  const withoutFk = [{ column_name: "mdata_vendor_id", f_table: "vendors", f_col: "operating_company_id" }];
  if (findMissingFk(withoutFk) === null) throw new Error("expected FAIL when only the composite FK exists");
  if (findMissingFk([]) === null) throw new Error("expected FAIL when no constraints exist at all");
  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else if (!process.env.DATABASE_URL) {
  throw new Error(`${LABEL}: DATABASE_URL required; --selftest is not live proof`);
} else {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT kcu.column_name, ccu.table_name AS f_table, ccu.column_name AS f_col
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'accounting' AND tc.table_name = 'bills'
        AND kcu.column_name = 'mdata_vendor_id'
    `);
    const problem = findMissingFk(rows);
    if (problem) {
      console.error(`${LABEL} FAIL: ${problem}`);
      process.exit(1);
    }
    console.log(`${LABEL} PASS — accounting.bills.mdata_vendor_id has a real FK to mdata.vendors.id`);
  } finally {
    await client.end();
  }
}
