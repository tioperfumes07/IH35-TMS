#!/usr/bin/env node
/**
 * GUARD-SETTLEMENT-CLOSE-POSTS-GL (ROUND 137, owner-directed, 2026-09-23)
 *
 * USMCA-LOAD-BOOKENDED-SETTLEMENTS-NEVER-POST-GL (docs/audit/GUARD-WORKORDERS.md): all 89 USMCA
 * driver_settlements (settlement_model='load_bookended') closed/locked with ZERO GL postings --
 * the load-bookended trip-close path (settlements-load-bookended.service.ts) writes
 * status='closed' directly and never calls a poster. The real poster (closeSettlementPayRun +
 * the "Driver Net-Pay Clearing" payment method, GL 2170) is proven correct -- owner-approved and
 * already used successfully for 13 other USMCA settlements (ROUND 16.22, scripts/ops/setl-close-
 * post-a-apply.ts) -- it is simply never invoked automatically when a load-bookended trip closes.
 *
 * THIS GUARD: fails closed if ANY USMCA settlement with status IN ('closed','locked') AND
 * settlement_model='load_bookended' carries ZERO live journal_entry_postings rows tied to it
 * (checked by source_transaction_id, matching the same lookup shape used everywhere else in this
 * codebase). This exact silent-zero-GL shape must never recur, whether from the historical 89,
 * a re-seed, or a future live close.
 *
 * A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B owner ruling) --
 * no ALLOW_OFFLINE_SKIP declared; this guard needs DATABASE_URL to mean anything.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlement-close-posts-gl";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const res = await client.query(
      `
        SELECT s.id::text, s.display_id, s.status, s.settlement_model
          FROM driver_finance.driver_settlements s
         WHERE s.operating_company_id = $1::uuid
           AND s.settlement_model = 'load_bookended'
           AND s.status IN ('closed', 'locked')
           AND NOT EXISTS (
             SELECT 1 FROM accounting.journal_entry_postings jep
              WHERE jep.operating_company_id = s.operating_company_id
                AND jep.source_transaction_id = s.id::text
           )
         ORDER BY s.display_id
      `,
      [USMCA]
    );

    await client.query("ROLLBACK");

    const offenders = res.rows;
    if (offenders.length > 0) {
      console.error(`${LABEL}: FAIL — ${offenders.length} load_bookended settlement(s) are closed/locked with ZERO live GL postings:`);
      for (const r of offenders.slice(0, 30)) {
        console.error(`  ✗ ${r.display_id} (${r.id}) status=${r.status}`);
      }
      if (offenders.length > 30) console.error(`  ... and ${offenders.length - 30} more`);
      console.error(`This is the exact USMCA-LOAD-BOOKENDED-SETTLEMENTS-NEVER-POST-GL shape (docs/audit/GUARD-WORKORDERS.md) -- the load-bookended close path must call closeSettlementPayRun (with the Driver Net-Pay Clearing payment method) before or as part of closing, not leave the settlement finalized with no ledger trace.`);
      process.exit(1);
    }

    console.log(`${LABEL}: OK — 0 closed/locked load_bookended settlements carry zero GL postings.`);
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
