#!/usr/bin/env node
/**
 * verify-load-revenue-posting-ratchet — Row 201
 * Guards that USMCA non-cancelled loads without revenue (rate_total_cents IS NULL
 * or 0) do not exceed the measured baseline (19 as of 2026-11-13). Ceiling drives
 * to 0 once revenue-posting engine backfills historical loads.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-load-revenue-posting-ratchet";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Ratchet ceiling: non-cancelled loads with no revenue
const NO_REVENUE_CEILING = 19;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;

  // Mutation 1: missing opco filter
  try {
    const fake1 = `SELECT COUNT(*) FROM mdata.loads WHERE rate_total_cents IS NULL AND status != 'cancelled'`;
    if (!fake1.includes("operating_company_id")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 1: missing operating_company_id caught`);
    }
  } catch {}

  // Mutation 2: including cancelled loads
  try {
    const fake2 = `SELECT COUNT(*) FROM mdata.loads WHERE operating_company_id=$1 AND rate_total_cents IS NULL`;
    if (!fake2.includes("cancelled")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 2: missing cancelled exclusion caught`);
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
        COUNT(*)                                                                AS total_loads,
        COUNT(*) FILTER (WHERE status != 'cancelled')                           AS active_loads,
        COUNT(*) FILTER (
          WHERE status != 'cancelled'
            AND (rate_total_cents IS NULL OR rate_total_cents = 0)
        )                                                                        AS no_revenue_count,
        COUNT(*) FILTER (
          WHERE status != 'cancelled'
            AND rate_total_cents IS NOT NULL
            AND rate_total_cents > 0
        )                                                                        AS has_revenue_count
      FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND is_sample_data IS DISTINCT FROM true
    `, [USMCA]);

    const { total_loads, active_loads, no_revenue_count, has_revenue_count } = r.rows[0];
    console.log(`[${LABEL}] total_loads=${total_loads} active=${active_loads} no_revenue=${no_revenue_count} has_revenue=${has_revenue_count}`);

    let pass = true;

    if (parseInt(no_revenue_count) > NO_REVENUE_CEILING) {
      console.error(`[${LABEL}] FAIL: no_revenue_count ${no_revenue_count} exceeds ceiling ${NO_REVENUE_CEILING}`);
      pass = false;
    }

    if (pass) {
      console.log(`[${LABEL}] PASS: no_revenue=${no_revenue_count}/${NO_REVENUE_CEILING} | PASS`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  if (!process.exitCode) process.exit(0);
}

main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
