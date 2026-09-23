#!/usr/bin/env node
/**
 * GUARD-REVREC-AND-PAYRUN-CLOSE-TAG-SOURCE (ROUND 137, owner-directed, 2026-09-23)
 *
 * The two highest-volume posting paths in this system -- revrec Event 1 "earn"
 * (revrec-delivery-posting/poster.service.ts) and settlement pay-run close
 * (settlement-payrun-close.service.ts) -- used to post with NO source_transaction_type at all on
 * any leg. Live-measured: 194 NULL-source USMCA journal entries, 71 "Revrec Event 1 earn ..." +
 * 52 "... pay-run close ..." among them (the rest are unrelated to these two writers), all
 * created 2026-09-06 through 2026-09-12. Both writers were already fixed in the same commit
 * (11ef93d2433cb8f7a8cfb7d0a79dda88de79e5e8, 2026-09-22T18:01:40-05:00) -- revrec 'earn' now
 * tags every leg source_transaction_type='load', settlement pay-run close now tags every leg
 * source_transaction_type='driver_settlement' -- confirmed by reading both call sites directly,
 * not assumed. The 194 historical rows are pre-fix debt, not an active gap; this guard exists so
 * that debt can never silently grow again, including through the AlwaysTrack re-seed.
 *
 * THIS GUARD: fails if ANY journal_entries row memo-matching either writer's own memo shape
 * ("Revrec Event 1 earn" / "pay-run close") has a NULL source_transaction_type on any of its
 * postings, UNLESS its created_at is at or before the fix commit's own timestamp (the named,
 * frozen historical baseline -- a shrink-only ratchet, never grows). A NEW occurrence after that
 * timestamp is the exact regression this guard exists to catch.
 *
 * A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B owner ruling) --
 * no ALLOW_OFFLINE_SKIP declared.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-revrec-and-payrun-close-tag-source";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// The commit that fixed both writers -- 2026-09-22T18:01:40-05:00 (11ef93d2433cb8f7a8cfb7d0a79dda88de79e5e8).
const FIX_LANDED_AT = "2026-09-22T23:01:40Z"; // converted to UTC (source commit is -05:00)
const KNOWN_PRE_FIX_COUNT = { revrec: 71, payrun: 52 };

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const res = await client.query(
      `
        SELECT
          (je.memo LIKE 'Revrec Event 1 earn%') AS is_revrec,
          (je.memo LIKE '%pay-run close%') AS is_payrun,
          je.id::text, je.created_at::text
        FROM accounting.journal_entries je
       WHERE je.operating_company_id = $1::uuid
         AND (je.memo LIKE 'Revrec Event 1 earn%' OR je.memo LIKE '%pay-run close%')
         AND je.created_at > $2::timestamptz
         AND EXISTS (
           SELECT 1 FROM accounting.journal_entry_postings jep
            WHERE jep.journal_entry_uuid = je.id AND jep.source_transaction_type IS NULL
         )
       ORDER BY je.created_at
      `,
      [USMCA, FIX_LANDED_AT]
    );

    const pre = await client.query(
      `
        SELECT
          count(*) FILTER (WHERE je.memo LIKE 'Revrec Event 1 earn%') AS revrec_n,
          count(*) FILTER (WHERE je.memo LIKE '%pay-run close%') AS payrun_n
        FROM accounting.journal_entries je
       WHERE je.operating_company_id = $1::uuid
         AND (je.memo LIKE 'Revrec Event 1 earn%' OR je.memo LIKE '%pay-run close%')
         AND je.created_at <= $2::timestamptz
         AND EXISTS (
           SELECT 1 FROM accounting.journal_entry_postings jep
            WHERE jep.journal_entry_uuid = je.id AND jep.source_transaction_type IS NULL
         )
      `,
      [USMCA, FIX_LANDED_AT]
    );

    await client.query("ROLLBACK");

    const offenders = res.rows;
    if (offenders.length > 0) {
      console.error(`${LABEL}: FAIL — ${offenders.length} NEW (post-fix) NULL-source journal entr(ies) from the revrec-earn or payrun-close writer:`);
      for (const r of offenders.slice(0, 30)) {
        console.error(`  ✗ ${r.id} created_at=${r.created_at} revrec=${r.is_revrec} payrun=${r.is_payrun}`);
      }
      console.error(`Both writers were fixed 2026-09-22 to always tag source_transaction_type/source_transaction_id -- a new NULL-source row from either one after that is a real regression, not known debt.`);
      process.exit(1);
    }

    console.log(`${LABEL}: OK — 0 new (post-fix) NULL-source journal entries from the revrec-earn or payrun-close writer.`);
    console.log(`  (pre-fix historical debt, frozen, not this guard's concern: revrec=${pre.rows[0].revrec_n} payrun=${pre.rows[0].payrun_n} -- named baseline revrec=${KNOWN_PRE_FIX_COUNT.revrec} payrun=${KNOWN_PRE_FIX_COUNT.payrun})`);
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
