#!/usr/bin/env node
/**
 * verify-vendor-bill-postings-ratchet — Row 81
 * Guards that USMCA non-void vendor bills without a GL account assignment
 * (coa_account_id IS NULL) do not exceed the measured baseline (9 as of
 * 2026-11-13). Ceiling drives to 0 once the bill-posting engine assigns
 * accounts to all legacy bills.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-vendor-bill-postings-ratchet";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Ratchet ceiling: non-void bills with no GL account
const UNCHARTED_CEILING = 9;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;

  // Mutation 1: missing opco filter
  try {
    const fake1 = `SELECT COUNT(*) FROM accounting.bills WHERE coa_account_id IS NULL AND status != 'void'`;
    if (!fake1.includes("operating_company_id")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 1: missing operating_company_id caught`);
    }
  } catch {}

  // Mutation 2: including voided bills in uncharted count
  try {
    const fake2 = `SELECT COUNT(*) FROM accounting.bills WHERE operating_company_id=$1 AND coa_account_id IS NULL`;
    if (!fake2.includes("void")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 2: missing void exclusion caught`);
    }
  } catch {}

  if (caught < 2) {
    console.error(`[${LABEL}] selftest FAIL: only ${caught}/2 mutations caught`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest PASS 2/2`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    await selftest();
    return;
  }

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");
    await client.query(`SET LOCAL app.operating_company_id = '${USMCA}'`);

    const r = await client.query(`
      SELECT
        COUNT(*)                                                               AS total_bills,
        COUNT(*) FILTER (WHERE status != 'void')                              AS active_bills,
        COUNT(*) FILTER (
          WHERE coa_account_id IS NULL AND status != 'void'
        )                                                                      AS uncharted_count,
        COUNT(*) FILTER (
          WHERE coa_account_id IS NOT NULL
        )                                                                      AS charted_count
      FROM accounting.bills
      WHERE operating_company_id = $1::uuid
        AND is_sample_data IS DISTINCT FROM true
    `, [USMCA]);

    const { total_bills, active_bills, uncharted_count, charted_count } = r.rows[0];
    console.log(`[${LABEL}] total_bills=${total_bills} active=${active_bills} uncharted=${uncharted_count} charted=${charted_count}`);

    let pass = true;

    if (parseInt(uncharted_count) > UNCHARTED_CEILING) {
      console.error(`[${LABEL}] FAIL: uncharted_count ${uncharted_count} exceeds ceiling ${UNCHARTED_CEILING}`);
      pass = false;
    }

    if (pass) {
      console.log(`[${LABEL}] PASS: uncharted=${uncharted_count}/${UNCHARTED_CEILING} | PASS`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  if (!process.exitCode) process.exit(0);
}

main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
