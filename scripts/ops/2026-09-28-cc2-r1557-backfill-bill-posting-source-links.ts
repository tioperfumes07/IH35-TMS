#!/usr/bin/env tsx
/**
 * ROUND 155.7 (Lead retraction, AUTH-088) -- linkage-only repair, NO NEW JE, NO NEW AMOUNT, NO
 * MONEY MOVED. The 90 USMCA driver-settlement "adopted" bills (Round 148 A/P adoption) carry
 * posting_hold_reason='adopted_from_payrun_gl_run:<run>:je:<je_id>' -- their liability is
 * ALREADY posted, live-verified line by line: every named JE credits 2170 Driver Net-Pay
 * Clearing (plus 7200 admin-fee income / 1245 cash-advance recovery / 2100-00-* escrow legs on
 * some), status='posted'. Nothing is missing from the GL. The defect is a MISSING BACK-REFERENCE:
 * `accounting.journal_entry_postings.source_transaction_type/source_transaction_id` on those
 * JEs' own postings still say 'driver_settlement'/<settlement_id> -- never 'bill'/<bill_id> --
 * so `ledger.posted_without_posting` (NOT EXISTS on source_transaction_type='bill') reports all
 * 90 as posted-without-posting, when in truth the posting exists and simply isn't tagged back to
 * its bill.
 *
 * SAFETY (verified live before writing this): void.service.ts's readOriginalGlPostings locates a
 * document's JE via `journal_entry_uuid IN (SELECT ... WHERE source_transaction_type=$3 AND
 * source_transaction_id=$2)`, then pulls EVERY posting on that SAME journal_entry_uuid -- not
 * filtered by source_transaction_type. So as long as AT LEAST ONE posting on a settlement's JE
 * still carries source_transaction_type='driver_settlement'/source_transaction_id=<settlement_id>,
 * voiding that settlement still finds and fully reverses every line on the JE, including any
 * lines this script repoints to 'bill'. Verified live: every one of the 41 named JEs has strictly
 * MORE posting lines than bills sharing it (headroom >= 1 in all 41 groups) -- confirmed by this
 * script's own pre-flight, which refuses if that is ever not true.
 *
 * ALGORITHM (deterministic, auditable, no amount-based guessing -- bills do not amount-match any
 * single posting line, since a JE is at the SETTLEMENT level and bills are at the LOAD level):
 *   1. Group the 90 bills by the JE named in their own posting_hold_reason.
 *   2. Within each JE, order its bills by load_number (via driver_finance.driver_settlement_gl_bills)
 *      ascending, and order its own postings by line_sequence DESCENDING (tail first).
 *   3. Assign the Kth bill (K=1..bills_in_group) to the Kth posting from the tail. This always
 *      leaves the LOWEST line_sequence lines (the primary Cost-of-Labor / driver-pay debit line(s))
 *      untouched and still 'driver_settlement'-tagged -- both for settlement-void safety (only
 *      needs >=1) and so a settlement's own headline GL line stays settlement-level, not
 *      arbitrarily reassigned to one bill among several sharing it.
 *   4. UPDATE that one posting row's source_transaction_type='bill', source_transaction_id=<bill.id>.
 *      No amount_cents change, no new row, no new journal_entry.
 *   5. Once every bill in a JE has a tagged posting, clear that bill's posting_hold_reason (NULL --
 *      "already posted", per the column's own comment) and sync paid_cents from its REAL bill_payments
 *      total (many of the 90 have status='paid' but paid_cents=0 despite a full-amount bill_payments
 *      row already existing -- a separate sync gap from the same Round 148 set-based script, which
 *      inserted bill_payments via raw SQL without the paired paid_cents update createBill/payBill
 *      would have done). status is left as-is (already 'paid' for all 90, which becomes accurate
 *      once paid_cents is synced).
 *   6. HARD CHECK before COMMIT: trial balance (SUM debit-credit across all live postings) is
 *      byte-identical before and after, and posting COUNT is unchanged (zero inserts, zero deletes,
 *      only source_transaction_type/source_transaction_id column values changed on existing rows).
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r1557-backfill-bill-posting-source-links.ts
 *     (dry-run: prints the full per-bill assignment plan, does not write)
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-088 npx tsx scripts/ops/2026-09-28-cc2-r1557-backfill-bill-posting-source-links.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const apply = process.argv.includes("--apply");

if (apply) {
  const auth = process.env.OWNER_AUTH_ID;
  if (auth !== "AUTH-088") {
    console.error(`FAIL: --apply requires OWNER_AUTH_ID=AUTH-088 (got ${JSON.stringify(auth ?? null)}).`);
    process.exit(1);
  }
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), "AUTH-088"], { stdio: "inherit" });
}

type BillRow = { id: string; amount_cents: number; posting_hold_reason: string; load_number: string | null };
type LineRow = { id: string; line_sequence: number; source_transaction_type: string | null; source_transaction_id: string | null };

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls','lucia', true)`);

  const tbBefore = await client.query<{ n: string; rows: string }>(
    `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text n, count(*)::text rows
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1`,
    [USMCA]
  );

  const billsRes = await client.query<BillRow>(
    `SELECT b.id, b.amount_cents,
            split_part(b.posting_hold_reason, ':je:', 2) AS je_id,
            g.load_number
       FROM accounting.bills b
       LEFT JOIN driver_finance.driver_settlement_gl_bills g ON g.accounting_bill_id = b.id
      WHERE b.operating_company_id = $1 AND b.voided_at IS NULL AND b.posting_hold_reason IS NOT NULL
      ORDER BY g.load_number NULLS LAST, b.id`,
    [USMCA]
  );

  const byJe = new Map<string, BillRow[]>();
  for (const r of billsRes.rows as unknown as Array<BillRow & { je_id: string }>) {
    const jeId = (r as unknown as { je_id: string }).je_id;
    if (!byJe.has(jeId)) byJe.set(jeId, []);
    byJe.get(jeId)!.push(r);
  }

  let totalBills = 0;
  let totalTagged = 0;
  const plan: Array<{ je: string; bill: string; load: string | null; line: string; lineSeq: number }> = [];

  for (const [jeId, bills] of byJe) {
    totalBills += bills.length;
    const linesRes = await client.query<LineRow>(
      `SELECT id, line_sequence, source_transaction_type, source_transaction_id
         FROM accounting.journal_entry_postings
        WHERE journal_entry_uuid = $1 AND operating_company_id = $2
        ORDER BY line_sequence DESC`,
      [jeId, USMCA]
    );
    if (linesRes.rows.length <= bills.length) {
      throw new Error(
        `REFUSED: JE ${jeId} has ${linesRes.rows.length} posting line(s) but ${bills.length} bill(s) -- ` +
          `no headroom to leave >=1 line settlement-tagged for void-safety. Not a case this script handles blindly.`
      );
    }
    for (let k = 0; k < bills.length; k++) {
      const bill = bills[k];
      const line = linesRes.rows[k];
      if (line.source_transaction_type === "bill" && line.source_transaction_id === bill.id) continue; // idempotent
      if (line.source_transaction_type !== "driver_settlement") {
        throw new Error(
          `REFUSED: JE ${jeId} line ${line.id} expected source_transaction_type='driver_settlement', found ` +
            `'${line.source_transaction_type}' -- refusing to overwrite an unexpected existing tag.`
        );
      }
      plan.push({ je: jeId, bill: bill.id, load: bill.load_number, line: line.id, lineSeq: line.line_sequence });
      if (apply) {
        await client.query(
          `UPDATE accounting.journal_entry_postings SET source_transaction_type='bill', source_transaction_id=$1
            WHERE id=$2 AND operating_company_id=$3`,
          [bill.id, line.id, USMCA]
        );
      }
      totalTagged++;
    }
  }

  console.log(`Plan: ${totalBills} bill(s) across ${byJe.size} JE(s), ${plan.length} line(s) to (re)tag this run.`);
  for (const p of plan) console.log(`  JE ${p.je} line_seq=${p.lineSeq} -> bill ${p.bill} (load ${p.load ?? "?"})`);

  if (apply) {
    // Clear posting_hold_reason + sync paid_cents from real bill_payments, for every bill now fully tagged.
    const clearRes = await client.query<{ id: string }>(
      `UPDATE accounting.bills b
          SET posting_hold_reason = NULL,
              paid_cents = COALESCE((SELECT SUM(bp.amount_cents) FROM accounting.bill_payments bp
                                       WHERE bp.bill_id = b.id AND bp.voided_at IS NULL), b.paid_cents)
        WHERE b.operating_company_id = $1 AND b.voided_at IS NULL AND b.posting_hold_reason IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM accounting.journal_entry_postings p
             WHERE p.source_transaction_type='bill' AND p.source_transaction_id = b.id::text
          )
        RETURNING b.id`,
      [USMCA]
    );
    console.log(`Cleared posting_hold_reason + synced paid_cents on ${clearRes.rows.length} bill(s).`);

    const tbAfter = await client.query<{ n: string; rows: string }>(
      `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text n, count(*)::text rows
         FROM accounting.journal_entry_postings WHERE operating_company_id=$1`,
      [USMCA]
    );
    if (tbBefore.rows[0].n !== tbAfter.rows[0].n || tbBefore.rows[0].rows !== tbAfter.rows[0].rows) {
      throw new Error(
        `REFUSED: trial balance or posting count changed. before=${JSON.stringify(tbBefore.rows[0])} after=${JSON.stringify(tbAfter.rows[0])}`
      );
    }
    console.log(`Trial balance unchanged: ${tbAfter.rows[0].n} cents across ${tbAfter.rows[0].rows} postings.`);
    await client.query("COMMIT");
    console.log("COMMITTED.");
  } else {
    await client.query("ROLLBACK");
    console.log("DRY RUN -- rolled back, no writes. Re-run with --apply and OWNER_AUTH_ID=AUTH-088 to commit.");
  }
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
