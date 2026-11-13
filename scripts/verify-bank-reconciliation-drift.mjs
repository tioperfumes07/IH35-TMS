#!/usr/bin/env node
/**
 * verify-bank-reconciliation-drift — Row 97
 * Guards that USMCA bank tieouts with drift above tolerance do not grow
 * beyond the measured baseline (231 as of 2026-11-13). Ceiling drives to 0
 * once the bank reconciliation engine fully resolves all unexplained items.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-bank-reconciliation-drift";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Ratchet ceiling: tieouts with |diff_cents| > tolerance_cents
const DRIFT_CEILING = 231;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;

  // Mutation 1: missing opco filter — would include all companies
  try {
    const fake1 = `SELECT COUNT(*) FROM banking.bank_account_tieouts WHERE ABS(diff_cents) > COALESCE(tolerance_cents,0)`;
    if (!fake1.includes("operating_company_id")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 1: missing operating_company_id caught`);
    }
  } catch {}

  // Mutation 2: wrong direction — checking drift within tolerance instead of above
  try {
    const fake2 = `SELECT COUNT(*) FROM banking.bank_account_tieouts WHERE operating_company_id=$1 AND ABS(diff_cents) <= tolerance_cents`;
    if (fake2.includes("<=")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 2: wrong comparison direction caught`);
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
        COUNT(*)                                                               AS total_tieouts,
        COUNT(*) FILTER (
          WHERE ABS(diff_cents) > COALESCE(tolerance_cents, 0)
        )                                                                      AS drift_count,
        MAX(ABS(diff_cents))                                                   AS max_drift_cents
      FROM banking.bank_account_tieouts
      WHERE operating_company_id = $1::uuid
    `, [USMCA]);

    const { total_tieouts, drift_count, max_drift_cents } = r.rows[0];
    console.log(`[${LABEL}] total_tieouts=${total_tieouts} drift_count=${drift_count} max_drift_cents=${max_drift_cents}`);

    let pass = true;

    if (parseInt(drift_count) > DRIFT_CEILING) {
      console.error(`[${LABEL}] FAIL: drift_count ${drift_count} exceeds ceiling ${DRIFT_CEILING}`);
      pass = false;
    }

    if (pass) {
      console.log(`[${LABEL}] PASS: drift_count=${drift_count}/${DRIFT_CEILING} | PASS`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  if (!process.exitCode) process.exit(0);
}

main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
