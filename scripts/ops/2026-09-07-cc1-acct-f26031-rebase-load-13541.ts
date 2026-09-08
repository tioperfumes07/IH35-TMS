#!/usr/bin/env tsx
// ACCT-F26031 remediation, invoice 1856d703 / load 13541 (ebf7e233-b78e-48f3-bbec-2d5fdd887274,
// $2,500.00) -- the one invoice from the CRITICAL-AR-TIEOUT-POSTED-WITHOUT-POSTING batch (2026-09-07)
// deliberately EXCLUDED from the blind 9-invoice re-fire because it needs a real re-basing correction,
// not a repost.
//
// LIVE-TRACED ROOT CAUSE (see docs/audit/GUARD-WORKORDERS.md "ACCT-F26031 -- OPEN" row for full
// evidence): this load was originally rated $3,500 and its two-event revrec latch fired both `earn`
// (JE 4b897636, DR Unbilled $3,500 / CR Revenue $3,500) and `bill` (JE 1bf5606c, DR A/R $3,500 / CR
// Unbilled $3,500, tagged to the OLD invoice 52f1c859). The owner then directed a void-and-reissue at
// a corrected $2,500 (load broke down, another carrier finished it, customer pays empty miles back to
// Laredo). Invoice 52f1c859 was voided and its $3,500 A/R leg was ALREADY correctly reversed by the
// existing void-reversal path (JE df6dff65, CR A/R $3,500 / DR Unbilled $3,500) -- that half of the
// fix already happened automatically. What's still wrong: the `earn` JE itself was never re-based --
// Unbilled Revenue and Revenue both still sit at the stale $3,500, $1,000 over the corrected $2,500.
//
// SECOND LIVE-TRACED WRINKLE (found by this script's own pre-flight abort on its first run, per
// "verify everything, never guess" -- do not blind-force past a guard that catches something you
// hadn't verified): the OLD `bill` JE (1bf5606c, DR A/R $3,500 / CR Unbilled $3,500, tagged to the
// voided invoice 52f1c859) is STILL "standing" per load_revenue_recognition_postings.is_active=true,
// even though its A/R leg was already exactly, dollar-for-dollar reversed by df6dff65 (CR A/R $3,500 /
// DR Unbilled $3,500 -- confirmed equal-and-opposite, full offset, live-queried). Root cause: the
// reversal-FK linkage (journal_entries.reversed_by_je_id/reverses_je_id, written by void.service.ts's
// postVoidReversal) only populates when the reversed postings carry a posting_batch_id -- and this
// revrec-latch JE was created via createJournalEntry directly, with posting_batch_id NULL on both its
// legs. That's a distinct, separate, pre-existing gap (not fixed here) that left the reversal
// economically real but FK-untracked, so STANDING_LATCH_JE_PREDICATE (voided_at IS NULL AND
// reversed_by_je_id IS NULL) still reads 1bf5606c as standing and would refuse a fresh Event 2.
// Since its GL effect is verifiably, exactly neutralized, this script also flips its
// load_revenue_recognition_postings row's is_active to false -- accurately recording an
// already-true economic fact in the one field this table has for exactly that purpose, not
// inventing anything.
//
// THIS SCRIPT REUSES ONLY EXISTING GL PRIMITIVES, NO NEW GL MATH:
//   1. voidJournalEntry() -- the SAME reversing-JE mechanism every other JE void uses -- reverses the
//      stale $3,500 earn JE (4b897636). Requires MONEY_CONTROL_VOID_REVERSAL_ENABLED (confirmed ON for
//      USMCA) and an Owner/Accountant actor (real owner user id, role looked up live below, not
//      assumed).
//   2. Two plain UPDATEs on accounting.load_revenue_recognition_postings (OUR OWN linkage/tracking
//      table, not a GL table) flipping the stale earn AND stale bill rows' is_active to false --
//      required because that table's partial unique index is (operating_company_id, load_id, event)
//      WHERE is_active, so fresh rows cannot insert while stale ones still claim the slot. Metadata
//      bookkeeping only; the dollar postings themselves are untouched by this step.
//   3. postLoadRevenueLatch(target_status='delivered_pending_docs') -- re-fires Event 1 fresh, reading
//      the load's CURRENT, real, already-corrected rate_total_cents ($2,500) -- never a guessed number.
//   4. fireRevrecLatchOnInvoiceIssued() -- fires Event 2 for the new invoice 1856d703 at whatever
//      earnAmountCents now resolves to (should be $2,500, matching the invoice exactly).
import pg from "pg";
import {
  postLoadRevenueLatch,
  fireRevrecLatchOnInvoiceIssued,
} from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.js";
import { voidJournalEntry } from "../../apps/backend/src/accounting/journal-entries.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_ID = "ebf7e233-b78e-48f3-bbec-2d5fdd887274";
const INVOICE_ID = "1856d703-0c07-4cfb-8a7d-39604a087d5e";
const STALE_EARN_JE_ID = "4b897636-e57d-4a62-86fe-e83eafee1987";
const STALE_BILL_JE_ID = "1bf5606c-d429-4e07-825e-1b01ac483f95";
const BILL_REVERSAL_JE_ID = "df6dff65-3da8-48c6-aa07-c07333a7d3cb";
const AR_ACCOUNT_ID = "11f4641f-6d83-4958-9f8b-0de94c107a70";
const VOID_REASON =
  "ACCT-F26031 re-basing: load 13541 re-rated $3,500 -> $2,500 (owner correction 2026-09-07, " +
  "power-only breakdown re-route). The invoice-side A/R leg for this re-rate already reversed " +
  "automatically (JE df6dff65). This earn JE is the other half -- reversing so Event 1 can re-fire " +
  "fresh at the corrected $2,500 rate before Event 2 fires for the reissued invoice 1856d703.";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  // PRE-FLIGHT -- re-verify every premise live, do not trust the earlier trace blindly.
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const owner = await c.query(`SELECT role FROM identity.users WHERE id = $1::uuid`, [OWNER_USER_ID]);
    const load = await c.query(
      `SELECT rate_total_cents, status FROM mdata.loads WHERE id = $1::uuid`,
      [LOAD_ID]
    );
    const inv = await c.query(
      `SELECT status, total_cents, voided_at FROM accounting.invoices WHERE id = $1::uuid`,
      [INVOICE_ID]
    );
    const latch = await c.query(
      `SELECT event, is_active, journal_entry_id::text FROM accounting.load_revenue_recognition_postings WHERE load_id = $1::uuid ORDER BY event`,
      [LOAD_ID]
    );
    const flag = await c.query(
      `SELECT enabled FROM lib.feature_flag_overrides WHERE flag_key = 'MONEY_CONTROL_VOID_REVERSAL_ENABLED' AND operating_company_id = $1::uuid`,
      [USMCA_COMPANY_ID]
    );
    const staleJe = await c.query(
      `SELECT voided_at, status FROM accounting.journal_entries WHERE id = $1::uuid`,
      [STALE_EARN_JE_ID]
    );
    // ACCT-F5723 (another agent's concurrent fix + FK backfill, applied moments before this run):
    // confirms the stale bill JE's reversal-FK linkage is now correctly recorded, and independently
    // confirms the reversal is an EXACT dollar-for-dollar offset (not partial) before this script
    // relies on that fact to deactivate the bill row below.
    const billJe = await c.query(
      `SELECT voided_at, reversed_by_je_id, reverses_je_id FROM accounting.journal_entries WHERE id = $1::uuid`,
      [STALE_BILL_JE_ID]
    );
    const billPostings = await c.query(
      `SELECT debit_or_credit, amount_cents FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid AND account_id = $2::uuid`,
      [STALE_BILL_JE_ID, AR_ACCOUNT_ID]
    );
    const reversalPostings = await c.query(
      `SELECT debit_or_credit, amount_cents FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid AND account_id = $2::uuid`,
      [BILL_REVERSAL_JE_ID, AR_ACCOUNT_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("PRE-FLIGHT owner role:", JSON.stringify(owner.rows[0]));
    console.log("PRE-FLIGHT load:", JSON.stringify(load.rows[0]));
    console.log("PRE-FLIGHT invoice:", JSON.stringify(inv.rows[0]));
    console.log("PRE-FLIGHT latch rows:", JSON.stringify(latch.rows));
    console.log("PRE-FLIGHT void-reversal flag (USMCA):", JSON.stringify(flag.rows[0]));
    console.log("PRE-FLIGHT stale earn JE:", JSON.stringify(staleJe.rows[0]));
    console.log("PRE-FLIGHT stale bill JE (FK):", JSON.stringify(billJe.rows[0]));
    console.log("PRE-FLIGHT stale bill JE A/R leg:", JSON.stringify(billPostings.rows));
    console.log("PRE-FLIGHT bill-reversal JE A/R leg:", JSON.stringify(reversalPostings.rows));

    if (owner.rows[0]?.role !== "Owner") throw new Error("ABORT: actor is not Owner-role -- premises changed");
    if (!flag.rows[0]?.enabled) throw new Error("ABORT: void-reversal flag not enabled for USMCA");
    if (Number(load.rows[0]?.rate_total_cents) !== 250000) throw new Error("ABORT: load rate is not $2,500 -- premises changed");
    if (inv.rows[0]?.status !== "sent" || inv.rows[0]?.voided_at) throw new Error("ABORT: invoice not sent/non-void -- premises changed");
    const earnRow = latch.rows.find((r: any) => r.event === "earn");
    const billRow = latch.rows.find((r: any) => r.event === "bill");
    if (!earnRow || earnRow.journal_entry_id !== STALE_EARN_JE_ID || !earnRow.is_active) {
      throw new Error("ABORT: stale earn row not in expected state -- premises changed");
    }
    if (!billRow || billRow.journal_entry_id !== STALE_BILL_JE_ID || !billRow.is_active) {
      throw new Error("ABORT: stale bill row not in expected state -- premises changed");
    }
    if (staleJe.rows[0]?.voided_at) throw new Error("ABORT: stale earn JE already voided -- premises changed");
    if (billJe.rows[0]?.reversed_by_je_id !== BILL_REVERSAL_JE_ID) {
      throw new Error("ABORT: stale bill JE's reversal FK is not linked as expected -- premises changed");
    }
    const billDebit = billPostings.rows.find((r: any) => r.debit_or_credit === "debit");
    const reversalCredit = reversalPostings.rows.find((r: any) => r.debit_or_credit === "credit");
    if (
      !billDebit ||
      !reversalCredit ||
      Number(billDebit.amount_cents) !== 350000 ||
      Number(billDebit.amount_cents) !== Number(reversalCredit.amount_cents)
    ) {
      throw new Error("ABORT: stale bill JE's A/R leg is not an exact offset of the reversal -- premises changed, do not deactivate");
    }
  }

  // STEP 1 -- reverse the stale $3,500 earn JE via the real, existing void mechanism.
  const voidResult = await voidJournalEntry(USMCA_COMPANY_ID, STALE_EARN_JE_ID, VOID_REASON, {
    userId: OWNER_USER_ID,
    role: "Owner",
  });
  console.log("STEP 1 (void stale earn JE) result:", JSON.stringify(voidResult));

  // STEP 2 -- deactivate BOTH stale linkage rows (earn AND bill) so the partial unique index
  // (operating_company_id, load_id, event) WHERE is_active allows fresh rows to insert. Metadata
  // bookkeeping on our own tracking table only -- no GL amounts touched here. The bill row's GL
  // effect was already verified, pre-flight, to be an EXACT dollar-for-dollar reversal (via the
  // ACCT-F5723 FK backfill applied moments earlier) -- deactivating it records an already-true
  // economic fact, not a new decision.
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const earnRes = await c.query(
      `
        UPDATE accounting.load_revenue_recognition_postings
        SET is_active = false
        WHERE load_id = $1::uuid AND event = 'earn' AND journal_entry_id = $2::uuid AND is_active
        RETURNING id::text
      `,
      [LOAD_ID, STALE_EARN_JE_ID]
    );
    const billRes = await c.query(
      `
        UPDATE accounting.load_revenue_recognition_postings
        SET is_active = false
        WHERE load_id = $1::uuid AND event = 'bill' AND journal_entry_id = $2::uuid AND is_active
        RETURNING id::text
      `,
      [LOAD_ID, STALE_BILL_JE_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("STEP 2 (deactivate stale earn row) result:", JSON.stringify(earnRes.rows));
    console.log("STEP 2 (deactivate stale bill row) result:", JSON.stringify(billRes.rows));
    if (earnRes.rows.length !== 1) throw new Error("ABORT: expected exactly one stale earn row deactivated");
    if (billRes.rows.length !== 1) throw new Error("ABORT: expected exactly one stale bill row deactivated");
  }

  // STEP 3 -- re-fire Event 1 fresh, reading the load's current real rate ($2,500).
  const earnResult = await postLoadRevenueLatch({
    operating_company_id: USMCA_COMPANY_ID,
    load_id: LOAD_ID,
    target_status: "delivered_pending_docs",
    entry_date_iso: new Date().toISOString(),
    actor_user_id: OWNER_USER_ID,
  });
  console.log("STEP 3 (Event 1 earn re-fire) result:", JSON.stringify(earnResult));
  if (!earnResult.posted || earnResult.event !== "earn") {
    throw new Error(`ABORT: Event 1 re-fire did not post as expected: ${JSON.stringify(earnResult)}`);
  }

  // STEP 4 -- fire Event 2 for the reissued invoice.
  await fireRevrecLatchOnInvoiceIssued({} as object, {
    operating_company_id: USMCA_COMPANY_ID,
    source_load_id: LOAD_ID,
    actor_user_id: OWNER_USER_ID,
    invoice_id: INVOICE_ID,
  });
  console.log("STEP 4 (Event 2 bill fire) invoked (swallow-and-log; see post-flight re-read)");

  // POST-FLIGHT -- re-read live state.
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const latch = await c.query(
      `SELECT event, is_active, journal_entry_id::text FROM accounting.load_revenue_recognition_postings WHERE load_id = $1::uuid ORDER BY event`,
      [LOAD_ID]
    );
    const arBalance = await c.query(
      `SELECT sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END) AS gl_ar_balance_cents FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid AND account_id = '11f4641f-6d83-4958-9f8b-0de94c107a70'`,
      [USMCA_COMPANY_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("POST-FLIGHT latch rows:", JSON.stringify(latch.rows));
    console.log("POST-FLIGHT GL 1100 (A/R) balance cents:", JSON.stringify(arBalance.rows[0]));
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
