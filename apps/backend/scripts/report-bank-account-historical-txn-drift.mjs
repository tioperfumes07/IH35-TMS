#!/usr/bin/env node
/** GAP-53 — Lists transactions that would be re-tagged after bank account OCI reassignment. */
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT t.id::text, t.bank_account_id::text, ba.account_mask, c.code AS current_oci
       FROM banking.bank_transactions t
       JOIN banking.bank_accounts ba ON ba.id = t.bank_account_id
       JOIN org.companies c ON c.id = ba.operating_company_id
       WHERE ba.account_mask LIKE '%6103' OR ba.account_mask LIKE '%6129' OR ba.account_mask LIKE '%6137'
       ORDER BY t.posted_at DESC LIMIT 500`
    ).catch(() => ({ rows: [] }));
    console.log(JSON.stringify({ count: res.rows.length, rows: res.rows }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
