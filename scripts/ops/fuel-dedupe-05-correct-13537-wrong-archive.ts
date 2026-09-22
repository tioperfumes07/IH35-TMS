#!/usr/bin/env tsx
// URGENT CORRECTION (Lead, 2026-09-22, same-turn as the fuel-dedupe-02 GL reversal): "NAME THE
// CANONICAL ROW FOR 13537 BEFORE ANYTHING ELSE. You archived the fuel row (statement ref
// 99456225, gross $1,164.04). Cursor's expense row is now the only live record of that purchase.
// Either restore the fuel row or confirm the expense stands. A VOID ON EITHER SIDE RIGHT NOW LOSES
// THE COST."
//
// ROOT CAUSE OF MY OWN MISTAKE, confirmed live before writing this fix: fuel.fuel_transactions row
// 390ee1a5-cde2-4f04-8ce4-4f4fe76a7447 (load 13537, 198.000gal, $1049.00 net, invoice 99456225)
// carries its OWN pre-existing note: "ABSORPTION-B1 doc 5783 load 13537 attribution_confidence=high"
// -- a real, independently-document-confirmed attribution from an earlier pass, NOT a duplicate of
// anything. FUEL-DEDUPE-01's naive (date, gallons) grouping coincidentally collided it with
// a5db39d9-822a-4b19-a819-ec120038712b (load 13539, ALSO 198.000gal on the same date, invoice
// 2247170 -- a completely unrelated, separate real purchase that happens to share the same
// tank-fill quantity). My cross-check only verified the GROUP had exactly one ground-truth EXACT
// dollar match (a5db39d9's own $1027.42 net matched its own ground truth; 390ee1a5's $1049.00 net
// did NOT exact-match its own ground truth $1164.04 GROSS -- a net-vs-gross mismatch, not evidence
// of being a duplicate) -- it never checked whether the "loser" row ALSO had its own independent,
// pre-existing high-confidence attribution. That gap is the actual defect; this script is the fix.
//
// LIVE-CONFIRMED before writing this: accounting.expenses row db0d5a8b-6e48-435b-a5bd-d3733605096a
// ("Diesel — ... — inv 99456225 — 2026-08-22 — $1164.04", load 13537, posted, not voided) is the
// SAME real purchase's Diesel-memo expense, created independently (Cursor, "missing-USMCA-seed").
// verify-diesel-expense-fuel-dedupe.mjs's own established law: a Diesel-memo accounting.expenses
// row and its paired fuel.fuel_transactions row are an INTENTIONAL 1:1 pairing, not a double-count.
// Archiving 390ee1a5 broke that pairing and left db0d5a8b orphaned. RESTORING the fuel row (not
// voiding the expense) is the correct fix -- it is the real, correct, document-confirmed record,
// and losing it would also lose IFTA gallon tracking for this purchase.
//
// FIX: (1) clear archived_at on 390ee1a5, with a correction note superseding the original wrong
// archive note (void-not-delete: the original note stays, this one is appended, nothing erased).
// (2) reverse the reversal JE (f7cbeaab-804a-48fc-aa9f-9027831c67a3) via the EXISTING
// voidJournalEntry engine -- posts a THIRD JE that reverses the reversal, netting the GL back to
// the original posted state, full WORM audit trail intact (original posted -> reversed by JE#2 ->
// JE#2 reversed by JE#3, GL effect restored). Never flips, never deletes, never reuses the
// original JE id.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { voidJournalEntry } from "../../apps/backend/src/accounting/journal-entries.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const FUEL_TXN_ID = "390ee1a5-cde2-4f04-8ce4-4f4fe76a7447";
const WRONG_REVERSAL_JE_ID = "f7cbeaab-804a-48fc-aa9f-9027831c67a3";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("ABORT: DATABASE_URL required.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");
  const dryRun = !process.argv.includes("--execute");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  console.log(`fuel-dedupe-05: ${dryRun ? "DRY RUN" : "EXECUTE"} -- correcting the wrong 13537 archive`);

  const before = await client.query<{ archived_at: string | null; notes: string | null }>(
    `SELECT archived_at::text, notes FROM fuel.fuel_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [FUEL_TXN_ID, USMCA_COMPANY_ID]
  );
  const row = before.rows[0];
  if (!row) throw new Error(`fuel_transaction ${FUEL_TXN_ID} not found`);
  if (!row.archived_at) {
    console.log(`  fuel_transactions row already has archived_at = NULL -- nothing to restore.`);
  } else {
    const correctionNote =
      `FUEL-DEDUPE-05 (2026-09-22, Lead-caught same-turn): the FUEL-DEDUPE-01 archive above was WRONG -- ` +
      `this row carries its own pre-existing high-confidence attribution (ABSORPTION-B1 doc 5783 load 13537) ` +
      `and is a real, separate purchase, not a duplicate of a5db39d9 (load 13539, a coincidental same-date/` +
      `same-gallons unrelated transaction). RESTORED: archived_at cleared.`;
    const combinedNotes = row.notes ? `${row.notes}\n${correctionNote}` : correctionNote;
    console.log(`  ${dryRun ? "WOULD RESTORE" : "RESTORING"} ${FUEL_TXN_ID} (currently archived at ${row.archived_at})`);
    if (!dryRun) {
      await client.query(
        `UPDATE fuel.fuel_transactions SET archived_at = NULL, notes = $2, updated_at = now() WHERE id = $1::uuid`,
        [FUEL_TXN_ID, combinedNotes]
      );
    }
  }

  const jeCheck = await client.query<{ status: string; reversed_by_je_id: string | null }>(
    `SELECT status, reversed_by_je_id::text FROM accounting.journal_entries WHERE id = $1::uuid`,
    [WRONG_REVERSAL_JE_ID]
  );
  const je = jeCheck.rows[0];
  if (!je) throw new Error(`journal_entry ${WRONG_REVERSAL_JE_ID} not found`);
  if (je.reversed_by_je_id) {
    console.log(`  reversal JE ${WRONG_REVERSAL_JE_ID} is already reversed by ${je.reversed_by_je_id} -- nothing to do.`);
  } else if (dryRun) {
    console.log(`  WOULD REVERSE the wrong reversal JE ${WRONG_REVERSAL_JE_ID} (restores original GL effect)`);
  } else {
    const result = await voidJournalEntry(
      USMCA_COMPANY_ID,
      WRONG_REVERSAL_JE_ID,
      "FUEL-DEDUPE-05 (2026-09-22): reverses FUEL-DEDUPE-02's own reversal of fuel_transactions row 390ee1a5 -- that row was a real, document-confirmed purchase for load 13537 (doc 5783), wrongly grouped as a duplicate of an unrelated load-13539 purchase that coincidentally shared 198.000 gallons on the same date. Restores the original GL posting.",
      { userId: OWNER_USER_ID, role: "Owner" }
    );
    console.log(`  REVERSED the wrong reversal -> ${JSON.stringify(result)}`);
  }

  const after = await client.query<{ archived_at: string | null }>(
    `SELECT archived_at::text FROM fuel.fuel_transactions WHERE id = $1::uuid`,
    [FUEL_TXN_ID]
  );
  const jeAfter = await client.query<{ reversed_by_je_id: string | null }>(
    `SELECT reversed_by_je_id::text FROM accounting.journal_entries WHERE id = $1::uuid`,
    [WRONG_REVERSAL_JE_ID]
  );
  console.log(`\nfuel-dedupe-05: re-check -- fuel_transactions.archived_at = ${after.rows[0]?.archived_at ?? "NULL"}; wrong-reversal JE now reversed_by = ${jeAfter.rows[0]?.reversed_by_je_id ?? "NULL"}.`);

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
