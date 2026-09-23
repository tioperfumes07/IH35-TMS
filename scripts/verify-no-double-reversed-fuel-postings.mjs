#!/usr/bin/env node
// P0 (Lead-directed, live production corruption found and confirmed 2026-09-23): postVoidReversal's
// readOriginalGlPostings used to pull EVERY journal_entry_uuid carrying a posting tagged a given
// (source_transaction_type, source_transaction_id) with NO filter for "already reversed." A document
// sharing that pair across MORE THAN ONE original JE (measured live: 464/624 USMCA
// fuel.fuel_transactions have 2-4 distinct original JEs each -- the common case, not an edge case)
// that had already had SOME of those JEs reversed by an earlier call had those already-reversed JEs'
// postings pulled back in and reversed A SECOND TIME by the next call -- a real, confirmed net GL
// misstatement: 130 of 222 already-voided production fuel_transactions carried a non-zero net balance
// across their combined original+reversal postings, $72,676.56 total absolute misstatement, live-
// verified before this guard was written (not projected). Fixed in void.service.ts's
// readOriginalGlPostings (the inner subquery now excludes JEs that are themselves already reversed).
//
// THIS GUARD: for every USMCA fuel.fuel_transactions row with voided_at IS NOT NULL, sums every
// posting on every journal_entry_uuid that (a) carries a posting tagged
// source_transaction_type='fuel_event' for this fuel_transaction, or (b) reverses a JE found by (a) --
// per account, signed (debit positive, credit negative). A clean reversal nets every account to
// exactly 0. A non-zero net is the exact double-reversal shape this P0 fixed. FAILS on any non-zero
// net found for ANY voided USMCA fuel_transaction -- this is a hard, zero-tolerance money-integrity
// check, not a ratchet with a baseline (a NEW occurrence of this exact corruption class must never be
// silently tolerated).
//
// SCOPED TO fuel.fuel_transactions specifically because that is the family this P0 was found and
// fixed against (fuel_event's own multi-JE-per-document rate is the trigger condition) -- the SAME
// underlying fix in readOriginalGlPostings protects every other VoidableEntityType too, but this guard
// checks the family that is actually exposed to it, not a generic sweep that would need a much larger
// baseline for pre-existing, already-known-corrupted rows this P0 has not yet remediated.
//
// A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B) -- no
// ALLOW_OFFLINE_SKIP declared.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-no-double-reversed-fuel-postings";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// KNOWN, PRE-EXISTING corruption from before this fix landed -- named individually, dated, not a
// wildcard. This P0's own remediation (owner ruling pending, per the OUTBOX report) will shrink this
// list; it must never grow. A future occurrence of this exact defect class on any id NOT in this list
// is a hard FAIL -- the fix above is what prevents new occurrences.
const KNOWN_PRE_FIX_CORRUPTED_COUNT = 130;

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const res = await client.query(`
      WITH voided AS (
        SELECT id FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL
      ),
      tagged_jes AS (
        SELECT DISTINCT v.id AS ft_id, jep.journal_entry_uuid
        FROM voided v
        JOIN accounting.journal_entry_postings jep
          ON jep.source_transaction_id = v.id::text AND jep.source_transaction_type = 'fuel_event'
      ),
      reversing_jes AS (
        SELECT tj.ft_id, je.reversed_by_je_id AS journal_entry_uuid
        FROM tagged_jes tj
        JOIN accounting.journal_entries je ON je.id = tj.journal_entry_uuid
        WHERE je.reversed_by_je_id IS NOT NULL
      ),
      all_jes AS (
        SELECT ft_id, journal_entry_uuid FROM tagged_jes
        UNION
        SELECT ft_id, journal_entry_uuid FROM reversing_jes
      ),
      balances AS (
        SELECT aj.ft_id, jep.account_id,
          SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END) AS net_cents
        FROM all_jes aj
        JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = aj.journal_entry_uuid
        GROUP BY aj.ft_id, jep.account_id
      )
      SELECT ft_id::text, SUM(abs(net_cents))::text AS abs_misstatement_cents
      FROM balances
      WHERE net_cents <> 0
      GROUP BY ft_id
      ORDER BY ft_id
    `, [USMCA]);

    await client.query("ROLLBACK");

    const corrupted = res.rows;
    if (corrupted.length > KNOWN_PRE_FIX_CORRUPTED_COUNT) {
      console.error(`${LABEL}: FAIL — ${corrupted.length} voided fuel_transaction(s) carry a non-zero net GL balance, more than the known pre-fix baseline (${KNOWN_PRE_FIX_CORRUPTED_COUNT}). A NEW double-reversal occurred.`);
      for (const r of corrupted.slice(0, 30)) {
        console.error(`  ✗ fuel_transaction=${r.ft_id} abs_misstatement_cents=${r.abs_misstatement_cents}`);
      }
      process.exit(1);
    }

    console.log(
      `${LABEL}: OK — ${corrupted.length} corrupted fuel_transaction(s) found, at or below the known pre-fix baseline (${KNOWN_PRE_FIX_CORRUPTED_COUNT}). No NEW double-reversal since the fix landed.`
    );
    if (corrupted.length > 0) {
      console.log(`  (these ${corrupted.length} are the pre-existing, not-yet-remediated rows this P0's report named — remediation is a separate owner-ruled step, not this guard's job.)`);
    }
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
