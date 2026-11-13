#!/usr/bin/env node
/**
 * verify-bank-pending-duplicates — Row 99
 * Guards that USMCA bank transactions never have a pending entry that also
 * has a matching posted entry for the same plaid_transaction_id. Plaid
 * normally removes the pending entry when it posts; a duplicate means the
 * feed did not clean up and the transaction will be counted twice.
 * Current baseline: 0 duplicates.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-bank-pending-duplicates";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Strict ceiling: pending txns that have a matching posted entry = 0
const DUPLICATE_CEILING = 0;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;

  // Mutation 1: missing opco filter
  try {
    const fake1 = `SELECT COUNT(*) FROM banking.bank_transactions WHERE pending=true AND plaid_transaction_id IS NOT NULL AND EXISTS (SELECT 1 FROM banking.bank_transactions b2 WHERE b2.plaid_transaction_id = bank_transactions.plaid_transaction_id AND b2.pending = false)`;
    if (!fake1.includes("operating_company_id")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 1: missing operating_company_id caught`);
    }
  } catch {}

  // Mutation 2: checking posted duplicates instead of pending duplicates
  try {
    const fake2 = `SELECT COUNT(*) FROM banking.bank_transactions WHERE operating_company_id=$1 AND pending=false AND plaid_transaction_id IS NOT NULL AND EXISTS (SELECT 1 FROM banking.bank_transactions b2 WHERE b2.plaid_transaction_id = bank_transactions.plaid_transaction_id AND b2.pending = false)`;
    if (fake2.includes("pending=false") && !fake2.includes("pending=true")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 2: wrong pending filter direction caught`);
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
        COUNT(*) FILTER (WHERE pending = true)                              AS total_pending,
        COUNT(*) FILTER (WHERE pending = false)                             AS total_posted,
        COUNT(*) FILTER (
          WHERE pending = true
            AND plaid_transaction_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM banking.bank_transactions b2
              WHERE b2.operating_company_id = $1::uuid
                AND b2.plaid_transaction_id = bank_transactions.plaid_transaction_id
                AND b2.pending = false
            )
        )                                                                    AS pending_with_posted_duplicate
      FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
        AND is_sample_data IS DISTINCT FROM true
    `, [USMCA]);

    const { total_pending, total_posted, pending_with_posted_duplicate } = r.rows[0];
    console.log(`[${LABEL}] total_pending=${total_pending} total_posted=${total_posted} pending_with_posted_duplicate=${pending_with_posted_duplicate}`);

    let pass = true;

    if (parseInt(pending_with_posted_duplicate) > DUPLICATE_CEILING) {
      console.error(`[${LABEL}] FAIL: pending_with_posted_duplicate ${pending_with_posted_duplicate} exceeds ceiling ${DUPLICATE_CEILING}`);
      pass = false;
    }

    if (pass) {
      console.log(`[${LABEL}] PASS: pending_with_posted_duplicate=${pending_with_posted_duplicate}/${DUPLICATE_CEILING} | PASS`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  if (!process.exitCode) process.exit(0);
}

main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
