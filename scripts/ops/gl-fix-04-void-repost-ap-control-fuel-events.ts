#!/usr/bin/env tsx
// R-30.1-A -- A/P CONTROL CONTAMINATION. 351 live fuel_event credit postings (76 Relay + 275
// Dreamline) wrongly hit GL 2000 (A/P control) instead of their own rail (2510 Dreamline / 1295
// Relay) -- resolveCompanyDirectCreditPreference collapsed every card-settled fuel purchase into
// a blanket "ap" preference; fixed in maybe-post-from-fuel-transaction.service.ts +
// poster.service.ts (this branch). This script corrects the 351 ALREADY-POSTED bad JEs:
//   1. VOID each (voidJournalEntry, reversing-entry model, cited reason -- never delete).
//   2. Flip the JE's posting_batches row from 'posted' to 'reversed' (the SAME transition
//      posting-engine.service.ts's own reversal flow already makes for every other poster) so the
//      fuel_event is recognized as needing a repost by the existing idempotency check
//      (resolveExistingPostedResult only treats batch_status='posted' as already-posted).
//   3. Repost via reflushUnpostedFuelGlExpenses (REUSED, existing, built for exactly this: finds
//      fuel.fuel_transactions with no posted posting_batches row and re-runs the real poster) --
//      now hitting the corrected code path, so the repost lands on 2510/1295, never 2000.
// No new GL math -- only account RESOLUTION changed; the debit/credit line shape is untouched.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { voidJournalEntry } from "../../apps/backend/src/accounting/journal-entries.service.js";
import { reflushUnpostedFuelGlExpenses } from "../../apps/backend/src/accounting/fuel-posting/reflush-unposted-fuel-gl.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const AP_CONTROL_ACCOUNT_ID = "34d5f1f7-385f-450c-b324-927fff09d31f"; // catalogs.accounts 2000, USMCA

const VOID_REASON =
  "R-30.1-A: fuel_event credit wrongly resolved to ap_control (GL 2000) via the old blanket " +
  "\"ap\" preference for every card-settled fuel purchase. ap_control has no accounting.bills " +
  "subledger backing a fuel-card purchase; the correct GL of record is the card's own rail " +
  "(2510 Dreamline Diesel Card Payable / 1295 Relay Fuel Wallet). Voiding to repost on the " +
  "corrected rail-resolution code path -- never a delete, never a net against the wrong account.";

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const rows = await client.query<{ journal_entry_id: string; posting_batch_id: string; fuel_transaction_id: string; amount_cents: string }>(
    `
      SELECT DISTINCT je.id::text AS journal_entry_id, pb.id::text AS posting_batch_id,
             pb.source_transaction_id AS fuel_transaction_id, jep.amount_cents::text AS amount_cents
        FROM accounting.journal_entry_postings jep
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
        JOIN accounting.posting_batches pb ON pb.id = jep.posting_batch_id
       WHERE je.operating_company_id = $1::uuid
         AND je.status = 'posted'
         AND jep.account_id = $2::uuid
         AND jep.debit_or_credit = 'credit'
         AND pb.source_transaction_type = 'fuel_event'
       ORDER BY je.id::text
    `,
    [USMCA_COMPANY_ID, AP_CONTROL_ACCOUNT_ID]
  );

  const totalCents = rows.rows.reduce((s, r) => s + Number(r.amount_cents), 0);
  console.log(`Found ${rows.rowCount} contaminated fuel_event JEs on ap_control, total $${(totalCents / 100).toFixed(2)}`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("DRY RUN -- would void each JE, flip its posting_batches row to 'reversed', then reflush.");
    return;
  }

  let voided = 0;
  let voidFailed = 0;
  for (const r of rows.rows) {
    try {
      await voidJournalEntry(USMCA_COMPANY_ID, r.journal_entry_id, VOID_REASON, { userId: OWNER_USER_ID, role: "Owner" });
      await client.query(
        `UPDATE accounting.posting_batches SET batch_status = 'reversed', updated_at = now() WHERE id = $1::uuid AND batch_status = 'posted'`,
        [r.posting_batch_id]
      );
      voided++;
    } catch (err) {
      voidFailed++;
      console.error(`  VOID FAILED ${r.journal_entry_id} (fuel_txn ${r.fuel_transaction_id}): ${err instanceof Error ? err.message : err}`);
    }
  }
  client.release();
  await pool.end();
  console.log(`Voided ${voided}, failed ${voidFailed}`);

  console.log("\nReflushing via reflushUnpostedFuelGlExpenses (reused, existing repost path)...");
  const reflush = await reflushUnpostedFuelGlExpenses({
    operating_company_id: USMCA_COMPANY_ID,
    actor_user_id: OWNER_USER_ID,
    dry_run: false,
  });
  console.log(JSON.stringify(reflush, null, 2));

  if (voidFailed > 0 || reflush.errors > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
