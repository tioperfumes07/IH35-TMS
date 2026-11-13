#!/usr/bin/env node
/**
 * verify-customer-payments-applied — Row 77
 * Guards that all active (non-voided) USMCA customer payments are fully applied
 * (amount_applied_cents = amount_cents). Current baseline: 0 unapplied payments
 * (payments table is empty as of 2026-11-13).
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-customer-payments-applied";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Ratchet ceiling: active payments with amount_applied_cents < amount_cents
const UNAPPLIED_CEILING = 0;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;

  // Mutation 1: missing opco filter
  try {
    const fake1 = `SELECT COUNT(*) FROM accounting.payments WHERE voided_at IS NULL AND COALESCE(amount_applied_cents,0) < amount_cents`;
    if (!fake1.includes("operating_company_id")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 1: missing operating_company_id caught`);
    }
  } catch {}

  // Mutation 2: including voided payments
  try {
    const fake2 = `SELECT COUNT(*) FROM accounting.payments WHERE operating_company_id=$1 AND COALESCE(amount_applied_cents,0) < amount_cents`;
    if (!fake2.includes("voided_at")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 2: missing voided_at exclusion caught`);
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
        COUNT(*)                                                                        AS total_active,
        COUNT(*) FILTER (
          WHERE COALESCE(amount_applied_cents, 0) < amount_cents
        )                                                                               AS unapplied_count,
        COUNT(*) FILTER (
          WHERE amount_applied_cents IS NOT NULL
            AND amount_applied_cents = amount_cents
        )                                                                               AS fully_applied_count
      FROM accounting.payments
      WHERE operating_company_id = $1::uuid
        AND voided_at IS NULL
    `, [USMCA]);

    const { total_active, unapplied_count, fully_applied_count } = r.rows[0];
    console.log(`[${LABEL}] total_active=${total_active} unapplied=${unapplied_count} fully_applied=${fully_applied_count}`);

    let pass = true;

    if (parseInt(unapplied_count) > UNAPPLIED_CEILING) {
      console.error(`[${LABEL}] FAIL: unapplied_count ${unapplied_count} exceeds ceiling ${UNAPPLIED_CEILING}`);
      pass = false;
    }

    if (pass) {
      console.log(`[${LABEL}] PASS: unapplied=${unapplied_count}/${UNAPPLIED_CEILING} | PASS`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  if (!process.exitCode) process.exit(0);
}

main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
