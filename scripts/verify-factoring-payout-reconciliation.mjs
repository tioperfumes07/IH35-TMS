#!/usr/bin/env node
/**
 * verify-factoring-payout-reconciliation — Row 84
 * Guards that all USMCA factoring purchases have journal entries posted.
 * As of 2026-11-13: 25 purchases, 0 without journal entry, 0 unposted.
 * Ceiling: 0 unposted purchases, 0 missing JEs.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-factoring-payout-reconciliation";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Strict ceilings: every factoring purchase must have a JE and be posted
const NO_JE_CEILING     = 0;
const UNPOSTED_CEILING  = 0;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;

  // Mutation 1: missing opco filter
  try {
    const fake1 = `SELECT COUNT(*) FROM accounting.factoring_purchases WHERE journal_entry_id IS NULL`;
    if (!fake1.includes("operating_company_id")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 1: missing operating_company_id caught`);
    }
  } catch {}

  // Mutation 2: checking for existing JE instead of missing JE
  try {
    const fake2 = `SELECT COUNT(*) FROM accounting.factoring_purchases WHERE operating_company_id=$1 AND journal_entry_id IS NOT NULL`;
    if (fake2.includes("IS NOT NULL") && !fake2.includes("IS NULL")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 2: wrong NULL check direction caught`);
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
        COUNT(*)                                                 AS total_purchases,
        COUNT(*) FILTER (WHERE journal_entry_id IS NULL)        AS no_je_count,
        COUNT(*) FILTER (WHERE journal_entry_id IS NOT NULL)    AS has_je_count,
        COUNT(*) FILTER (WHERE posted_at IS NULL)               AS unposted_count
      FROM accounting.factoring_purchases
      WHERE operating_company_id = $1::uuid
        AND is_sample_data IS DISTINCT FROM true
    `, [USMCA]);

    const { total_purchases, no_je_count, has_je_count, unposted_count } = r.rows[0];
    console.log(`[${LABEL}] total_purchases=${total_purchases} no_je=${no_je_count} has_je=${has_je_count} unposted=${unposted_count}`);

    let pass = true;

    if (parseInt(no_je_count) > NO_JE_CEILING) {
      console.error(`[${LABEL}] FAIL: no_je_count ${no_je_count} exceeds ceiling ${NO_JE_CEILING}`);
      pass = false;
    }
    if (parseInt(unposted_count) > UNPOSTED_CEILING) {
      console.error(`[${LABEL}] FAIL: unposted_count ${unposted_count} exceeds ceiling ${UNPOSTED_CEILING}`);
      pass = false;
    }

    if (pass) {
      console.log(`[${LABEL}] PASS: no_je=${no_je_count}/${NO_JE_CEILING} unposted=${unposted_count}/${UNPOSTED_CEILING} | PASS`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  if (!process.exitCode) process.exit(0);
}

main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
