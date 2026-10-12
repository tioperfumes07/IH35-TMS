#!/usr/bin/env node
// ROUND 134.1 (Lead, P0): postVoidReversal's reversed_by_je_id header-linkage write used to run
// ONLY when exactly one other original JE shared a (source_transaction_type, source_transaction_id)
// pair -- silently no-op on every multi-JE document (the common case for fuel: 464/624 USMCA
// fuel_transactions have 2-4 distinct original JEs). Called "bookkeeping-only" in ACCT-F2026092326's
// own report; it is not -- it is why the 122 real double-reversal-corrupted fuel_transactions could
// not be found through linkage at all (1665 reversing JEs / 1665 distinct originals / 0 doubles BY
// LINKAGE, while the account-level net-balance scan found 122 real corrupted rows the same linkage
// could not see) and it would do the same thing to every future multi-JE-document reversal.
//
// FIX (void.service.ts): reversed_by_je_id is now written on EVERY original JE in a reversed set,
// not only when the set size is 1.
//
// THIS GUARD: any USMCA journal_entry that is fully reversed at the LINE level (every one of its
// postings carries a non-null reversed_by_line_id -- the ground-truth, per-posting signal) but still
// shows reversed_by_je_id IS NULL at the HEADER level is exactly the defect this round fixed.
// BASELINE (shrink-only, same shape as every other guard's ratchet this session): 116 pre-existing
// rows in this exact state, live-measured before this fix landed -- a metadata-only backfill (no
// dollar amount is touched by setting this column), not remediated in this same PR; named here so
// it stays visible and shrink-only rather than silently tolerated forever.
//
// A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B) -- no
// ALLOW_OFFLINE_SKIP declared.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-reversed-jes-carry-header-linkage";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const KNOWN_PRE_FIX_BASELINE_COUNT = 116;

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const res = await client.query(`
      SELECT id::text FROM (
        SELECT je.id
        FROM accounting.journal_entries je
        JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
        WHERE je.operating_company_id = $1::uuid
          AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
        GROUP BY je.id
        HAVING bool_and(jep.reversed_by_line_id IS NOT NULL)
      ) x
    `, [USMCA]);

    await client.query("ROLLBACK");

    const count = res.rows.length;
    if (count > KNOWN_PRE_FIX_BASELINE_COUNT) {
      console.error(`${LABEL}: FAIL — ${count} journal_entry row(s) are fully line-reversed but missing header-level reversed_by_je_id, more than the known pre-fix baseline (${KNOWN_PRE_FIX_BASELINE_COUNT}). A NEW occurrence of the defect this round fixed.`);
      for (const r of res.rows.slice(0, 30)) console.error(`  ✗ ${r.id}`);
      process.exit(1);
    }

    console.log(`${LABEL}: OK — ${count} row(s) found, at or below the known pre-fix baseline (${KNOWN_PRE_FIX_BASELINE_COUNT}). No NEW occurrence since the fix landed.`);
    process.exit(0);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL —`, e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
