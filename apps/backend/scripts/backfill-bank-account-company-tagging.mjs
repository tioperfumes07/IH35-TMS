#!/usr/bin/env node
/** GAP-53 — Dry-run backfill report for bank account OCI tagging. */
import pg from "pg";
const DRY_RUN = !process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const TRUTH = { "6103": "TRANSP", "6129": "TRANSP", "6137": "TRANSP" };

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT ba.id::text, ba.account_mask, c.code AS oci
       FROM banking.bank_accounts ba JOIN org.companies c ON c.id = ba.operating_company_id`
    );
    for (const row of res.rows) {
      const last4 = String(row.account_mask ?? "").slice(-4);
      const expected = TRUTH[last4];
      if (!expected || row.oci === expected) continue;
      console.log(`${DRY_RUN ? "[dry-run]" : "[apply]"} ${row.id} ${last4}: ${row.oci} → ${expected}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
