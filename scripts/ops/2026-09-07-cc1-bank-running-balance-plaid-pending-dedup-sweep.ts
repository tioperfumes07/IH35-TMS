#!/usr/bin/env tsx
// BANK-RUNNING-BALANCE-STILL-BROKEN-UNFILTERED (2026-09-08) — the owner's own alert diagnosed this
// as a same-day sort tiebreak bug in BankingTransactionsDesignView.tsx's runningBalanceById walk.
// Live-traced instead to a MUCH bigger, pre-existing root cause: banking.bank_transactions carries
// hundreds of stale Plaid PENDING rows that were never retired when their POSTED counterpart arrived
// (historical residue from before pending_transaction_id linkage was honored -- see
// bank-tx-dedup.ts's own header on supersedePlaidPendingByExactPostedCandidate, "operator remediation
// for historical rows ingested before pending_transaction_id was honored"). The account/date the owner
// named (e83028a5-..., 2026-09-04) has THREE such duplicate Zelle pairs alone; the pattern repeats on
// literally every date checked back through 2026-08-19. Walking the running balance backward sums
// BOTH the pending and posted copy of the same real-world transaction, corrupting every balance before
// the duplication started -- not a sort/tiebreak defect at all.
//
// THE ONGOING Plaid sync path (plaid.service.ts) ALREADY correctly retires a pending row the instant
// its posted successor arrives (retirePlaidPendingPredecessor, keyed on Plaid's own stable
// pending_transaction_id -- reliable, not fuzzy description matching). This is a ONE-TIME backlog of
// old rows from before that linkage was reliably present. The exact-match remediation function
// (supersedePlaidPendingByExactPostedCandidate) already exists, is already wired to a manual
// operator endpoint (p7-wave2.routes.ts), and was simply never run in bulk. This script does exactly
// that: reuses the SAME function, no new dedup math, across every eligible pending row.
//
// SAFE BY CONSTRUCTION: the function itself refuses (no-ops) whenever a pending row is
// financially_linked (already matched to a JE/obligation/GL account) or has zero/multiple exact
// posted candidates (same bank_account_id, amount_cents, is_credit, date +/- 7 days) -- it can only
// ever void (soft-delete, WORM-preserved via voided_at, never a hard DELETE) a pending row that has
// exactly one unambiguous real successor already on the books.
import pg from "pg";
import { supersedePlaidPendingByExactPostedCandidate } from "../../apps/backend/src/banking/bank-tx-dedup.js";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const listClient = await pool.connect();
  await listClient.query("BEGIN");
  await listClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const pendingRows = await listClient.query<{ id: string; operating_company_id: string }>(
    `
      SELECT id::text, operating_company_id::text
      FROM banking.bank_transactions
      WHERE source = 'plaid'
        AND pending = true
        AND voided_at IS NULL
        AND matched_journal_entry_id IS NULL
        AND reconciled_obligation_id IS NULL
        AND categorization_gl_account_id IS NULL
      ORDER BY operating_company_id, transaction_date
    `
  );
  await listClient.query("COMMIT");
  listClient.release();

  console.log(`Found ${pendingRows.rows.length} eligible (non-financially-linked) pending rows to check.`);

  const tally: Record<string, number> = {};
  const superseded: Array<{ pending_id: string; posted_id: string }> = [];

  for (const row of pendingRows.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      const result = await supersedePlaidPendingByExactPostedCandidate(client as never, {
        pendingRowId: row.id,
        operatingCompanyId: row.operating_company_id,
      });
      await client.query("COMMIT");
      if (result.superseded) {
        tally.superseded = (tally.superseded ?? 0) + 1;
        superseded.push({ pending_id: result.pending_id, posted_id: result.posted_id });
      } else {
        tally[result.reason] = (tally[result.reason] ?? 0) + 1;
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      tally.error = (tally.error ?? 0) + 1;
      console.error(`error on ${row.id}:`, err);
    } finally {
      client.release();
    }
  }

  console.log("TALLY:", JSON.stringify(tally, null, 2));
  console.log(`Superseded ${superseded.length} pending rows.`);
  console.log("First 20 superseded pairs:", JSON.stringify(superseded.slice(0, 20), null, 2));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
