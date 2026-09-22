#!/usr/bin/env tsx
// URGENT CORRECTION #2, same session/turn as fuel-dedupe-05. Self-audit triggered by the Lead's
// own catch on load 13537 (fuel-dedupe-05): re-checked EVERY row FUEL-DEDUPE-01/03 archived for
// the SAME root-cause pattern (a pre-existing "ABSORPTION-B1 ... attribution_confidence=...
// kept_separate_per_one_row_rule" note that an earlier pass had ALREADY deliberately decided to
// keep, which my exact-match cross-check never looked for before archiving). Found exactly 2 more:
//
//   3b43235e-cbff-4ce0-aae7-bb235a83293b (load 13557, doc 5789, invoice 99794138, $928.21) --
//   its own note: "ABSORPTION-B1 doc 5789 load 13557 attribution_confidence=low
//   CROSS_LOAD_DUPLICATE_INVOICE_99794138_also_on_load_13571_doc_5799_same_driver_unit_
//   kept_separate_per_one_row_rule" -- the SAME invoice number prints on both load 13557's AND
//   load 13571's own AlwaysTrack settlement pages (same driver/unit); ABSORPTION-B1 already
//   evaluated this and explicitly ruled to keep both rows separate, not merge one into the other.
//   I archived it anyway, overriding that ruling without reading it first.
//
//   5ff0c075-314f-4bbe-8de4-9401d5be21b0 (load 13547, doc 5792, invoice 1848853, $538.42) -- same
//   shape: "ABSORPTION-B1 doc 5792 load 13547 attribution_confidence=low
//   CROSS_LOAD_DUPLICATE_INVOICE_1848853_also_on_load_13543_doc_5785_same_driver_unit_
//   kept_separate_per_one_row_rule".
//
// Exhaustively re-checked (live SQL, notes ILIKE '%ABSORPTION-B1%' across every currently-archived
// row): exactly these 2, plus the 2 pre-existing 5796-owner-ruling archivals from an EARLIER
// session (ad84ed16/c31226e9, untouched by this correction -- those were already correctly
// archived before this session even started, unrelated to FUEL-DEDUPE-01/03).
//
// FIX: same pattern as fuel-dedupe-05 -- restore archived_at, reverse the wrong reversal JE via
// the existing voidJournalEntry engine (a third JE reversing the reversal, WORM trail intact,
// nothing flipped or deleted).
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { voidJournalEntry } from "../../apps/backend/src/accounting/journal-entries.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const CORRECTIONS: Array<{ fuelTxnId: string; wrongReversalJeId: string; note: string }> = [
  {
    fuelTxnId: "3b43235e-cbff-4ce0-aae7-bb235a83293b",
    wrongReversalJeId: "b805eb73-a6fa-4ccb-9704-2305b29fe1dc",
    note: "load 13557 / doc 5789 / invoice 99794138 -- ABSORPTION-B1 already ruled kept_separate_per_one_row_rule against load 13571's own copy of the same invoice number",
  },
  {
    fuelTxnId: "5ff0c075-314f-4bbe-8de4-9401d5be21b0",
    wrongReversalJeId: "dcf0e72e-c7cc-457f-bcdd-c6358a9f3e02",
    note: "load 13547 / doc 5792 / invoice 1848853 -- ABSORPTION-B1 already ruled kept_separate_per_one_row_rule against load 13543's own copy of the same invoice number",
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("ABORT: DATABASE_URL required.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");
  const dryRun = !process.argv.includes("--execute");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  console.log(`fuel-dedupe-06: ${dryRun ? "DRY RUN" : "EXECUTE"} -- correcting 2 more wrong archives`);

  for (const c of CORRECTIONS) {
    const before = await client.query<{ archived_at: string | null; notes: string | null }>(
      `SELECT archived_at::text, notes FROM fuel.fuel_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [c.fuelTxnId, USMCA_COMPANY_ID]
    );
    const row = before.rows[0];
    if (!row) {
      console.error(`  SKIP ${c.fuelTxnId}: not found`);
      continue;
    }
    if (!row.archived_at) {
      console.log(`  ${c.fuelTxnId}: already archived_at = NULL -- nothing to restore.`);
    } else {
      const correctionNote =
        `FUEL-DEDUPE-06 (2026-09-22, same-turn self-audit after the Lead caught 13537): the ` +
        `FUEL-DEDUPE-01 archive above was WRONG -- ${c.note}. RESTORED: archived_at cleared.`;
      const combinedNotes = row.notes ? `${row.notes}\n${correctionNote}` : correctionNote;
      console.log(`  ${dryRun ? "WOULD RESTORE" : "RESTORING"} ${c.fuelTxnId} (currently archived at ${row.archived_at})`);
      if (!dryRun) {
        await client.query(
          `UPDATE fuel.fuel_transactions SET archived_at = NULL, notes = $2, updated_at = now() WHERE id = $1::uuid`,
          [c.fuelTxnId, combinedNotes]
        );
      }
    }

    const jeCheck = await client.query<{ status: string; reversed_by_je_id: string | null }>(
      `SELECT status, reversed_by_je_id::text FROM accounting.journal_entries WHERE id = $1::uuid`,
      [c.wrongReversalJeId]
    );
    const je = jeCheck.rows[0];
    if (!je) {
      console.error(`  SKIP ${c.wrongReversalJeId}: journal_entry not found`);
      continue;
    }
    if (je.reversed_by_je_id) {
      console.log(`  reversal JE ${c.wrongReversalJeId} is already reversed by ${je.reversed_by_je_id} -- nothing to do.`);
    } else if (dryRun) {
      console.log(`  WOULD REVERSE the wrong reversal JE ${c.wrongReversalJeId} (restores original GL effect)`);
    } else {
      const result = await voidJournalEntry(
        USMCA_COMPANY_ID,
        c.wrongReversalJeId,
        `FUEL-DEDUPE-06 (2026-09-22): reverses FUEL-DEDUPE-01's own wrong reversal of fuel_transactions row ${c.fuelTxnId} -- ${c.note}. Restores the original GL posting.`,
        { userId: OWNER_USER_ID, role: "Owner" }
      );
      console.log(`  REVERSED the wrong reversal for ${c.fuelTxnId} -> ${JSON.stringify(result)}`);
    }
  }

  console.log(`\nfuel-dedupe-06: re-check:`);
  for (const c of CORRECTIONS) {
    const after = await client.query<{ archived_at: string | null }>(
      `SELECT archived_at::text FROM fuel.fuel_transactions WHERE id = $1::uuid`,
      [c.fuelTxnId]
    );
    const jeAfter = await client.query<{ reversed_by_je_id: string | null }>(
      `SELECT reversed_by_je_id::text FROM accounting.journal_entries WHERE id = $1::uuid`,
      [c.wrongReversalJeId]
    );
    console.log(`  ${c.fuelTxnId}: archived_at=${after.rows[0]?.archived_at ?? "NULL"}, wrong-reversal-JE reversed_by=${jeAfter.rows[0]?.reversed_by_je_id ?? "NULL"}`);
  }

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
