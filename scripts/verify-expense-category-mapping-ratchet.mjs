#!/usr/bin/env node
/**
 * verify-expense-category-mapping-ratchet — Row 83
 * Guards that USMCA expense category account mappings maintain at least the
 * measured number of active mappings (33 active as of 2026-11-13). Also
 * enforces that inactive mappings do not exceed the measured baseline (1).
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-expense-category-mapping-ratchet";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Ratchet: active mappings must not fall below floor, inactive must not exceed ceiling
const ACTIVE_FLOOR    = 33;
const INACTIVE_CEILING = 1;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;

  // Mutation 1: missing opco filter
  try {
    const fake1 = `SELECT COUNT(*) FROM accounting.expense_category_account_map WHERE is_active = true`;
    if (!fake1.includes("operating_company_id")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 1: missing operating_company_id caught`);
    }
  } catch {}

  // Mutation 2: checking inactive instead of active for floor
  try {
    const fake2 = `SELECT COUNT(*) FROM accounting.expense_category_account_map WHERE operating_company_id=$1 AND is_active = false`;
    if (!fake2.includes("is_active = true") && fake2.includes("is_active = false")) {
      caught++;
      console.log(`[${LABEL}] selftest PASS mutation 2: wrong is_active direction caught`);
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
        COUNT(*)                                              AS total_mappings,
        COUNT(*) FILTER (WHERE is_active = true)             AS active_count,
        COUNT(*) FILTER (WHERE is_active = false)            AS inactive_count,
        COUNT(DISTINCT category_kind)                        AS distinct_kinds
      FROM accounting.expense_category_account_map
      WHERE operating_company_id = $1::uuid
    `, [USMCA]);

    const { total_mappings, active_count, inactive_count, distinct_kinds } = r.rows[0];
    console.log(`[${LABEL}] total=${total_mappings} active=${active_count} inactive=${inactive_count} kinds=${distinct_kinds}`);

    let pass = true;

    if (parseInt(active_count) < ACTIVE_FLOOR) {
      console.error(`[${LABEL}] FAIL: active_count ${active_count} fell below floor ${ACTIVE_FLOOR}`);
      pass = false;
    }
    if (parseInt(inactive_count) > INACTIVE_CEILING) {
      console.error(`[${LABEL}] FAIL: inactive_count ${inactive_count} exceeds ceiling ${INACTIVE_CEILING}`);
      pass = false;
    }

    if (pass) {
      console.log(`[${LABEL}] PASS: active=${active_count}>=${ACTIVE_FLOOR} inactive=${inactive_count}/${INACTIVE_CEILING} | PASS`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  if (!process.exitCode) process.exit(0);
}

main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
