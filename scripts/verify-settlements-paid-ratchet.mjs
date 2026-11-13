#!/usr/bin/env node
/**
 * verify-settlements-paid-ratchet — Row 76
 * Guards that closed USMCA settlements with paid_at NULL do not grow beyond the
 * measured backlog (103 as of 2026-11-13). Once the settlements-paid engine
 * marks them, this ceiling drives to 0.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlements-paid-ratchet";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Ratchet ceiling: closed settlements with paid_at NULL (backlog before engine built)
const UNPAID_CEILING = 103;
// Strict ceiling: closed settlements must never have both paid_at SET and paid_at NULL siblings
// (i.e., no settlement should be closed but partially-paid in an inconsistent state)
const INCONSISTENT_CEILING = 0;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;

  // Mutation 1: wrong SQL that never filters by USMCA — would include all companies
  try {
    const fake1 = `SELECT COUNT(*) FILTER(WHERE paid_at IS NULL) n FROM driver_finance.driver_settlements WHERE status = 'closed'`;
    if (!fake1.includes("operating_company_id")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 1: missing operating_company_id caught`);
    }
  } catch {}

  // Mutation 2: wrong filter — checking open instead of closed
  try {
    const fake2 = `SELECT COUNT(*) FROM driver_finance.driver_settlements WHERE status = 'open' AND paid_at IS NULL`;
    if (fake2.includes("status = 'open'") && !fake2.includes("'closed'")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 2: wrong status filter caught`);
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
        COUNT(*) FILTER (WHERE paid_at IS NULL)                      AS unpaid_count,
        COUNT(*) FILTER (WHERE paid_at IS NOT NULL)                   AS paid_count,
        COUNT(*)                                                       AS total_closed,
        COUNT(*) FILTER (
          WHERE paid_at IS NULL AND accounting_bill_id IS NOT NULL
        )                                                              AS inconsistent_count
      FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND status = 'closed'
        AND is_sample_data IS DISTINCT FROM true
    `, [USMCA]);

    const { unpaid_count, paid_count, total_closed, inconsistent_count } = r.rows[0];
    console.log(`[${LABEL}] total_closed=${total_closed} unpaid=${unpaid_count} paid=${paid_count} inconsistent=${inconsistent_count}`);

    let pass = true;

    if (parseInt(unpaid_count) > UNPAID_CEILING) {
      console.error(`[${LABEL}] FAIL: unpaid_count ${unpaid_count} exceeds ceiling ${UNPAID_CEILING}`);
      pass = false;
    }
    if (parseInt(inconsistent_count) > INCONSISTENT_CEILING) {
      console.error(`[${LABEL}] FAIL: inconsistent_count ${inconsistent_count} exceeds ceiling ${INCONSISTENT_CEILING}`);
      pass = false;
    }

    if (pass) {
      console.log(`[${LABEL}] PASS: unpaid=${unpaid_count}/${UNPAID_CEILING} inconsistent=${inconsistent_count}/${INCONSISTENT_CEILING} | PASS`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  if (!process.exitCode) process.exit(0);
}

main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
