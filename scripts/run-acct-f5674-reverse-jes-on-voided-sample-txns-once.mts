/**
 * ACCT-F5674 — WORM-reverse the 24 journal entries that Cursor ops posted onto USMCA's VOIDED
 * insurance-dispersal SAMPLE bank transactions (owner order 2026-08-20: reverse with
 * reverseJournalEntryNoFlip; do NOT un-void, do NOT re-post; keep live sample bee7219c-… and
 * CM-2026-0001 untouched).
 *
 * The txns were voided 2026-08-11 (owner_void_all_usmca_test); the JEs were posted onto them later,
 * before the ACCT-F5672 bill-backed interlock deployed. Selection is EXACT: JEs whose bank
 * transaction is VOIDED — the keeper rows are non-voided and therefore never selected.
 *
 * Reversal goes through the canonical shared helper (reverseJournalEntryNoFlip): posts a LINKED
 * reversing JE via postVoidReversal, never flips status (GL readers exclude 'voided' — a flip would
 * silently drop the original), idempotent on re-run (returns the existing reversal).
 *
 * Usage:
 *   DATABASE_URL=<direct> DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-acct-f5674-reverse-jes-on-voided-sample-txns-once.mts [--commit]
 * Without --commit: read-only preview.
 */
import pg from "pg";
import { reverseJournalEntryNoFlip } from "../apps/backend/src/accounting/journal-entries.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--commit");
const REASON =
  "ACCT-F5674: JE was posted onto a VOIDED sample bank transaction (voided 2026-08-11 owner_void_all_usmca_test); owner order 2026-08-20: WORM-reverse, never un-void, never re-post";

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  const who = await client.query<{ u: string }>(`SELECT current_user AS u`);
  console.log(`current_user=${who.rows[0].u}`);

  const targets = await client.query<{ je_id: string; txn_id: string; memo: string | null }>(
    `
      SELECT je.id::text AS je_id, bt.id::text AS txn_id, je.memo
      FROM banking.bank_transactions bt
      JOIN accounting.journal_entries je
        ON je.id = bt.matched_journal_entry_id
       AND je.operating_company_id = bt.operating_company_id
      WHERE bt.operating_company_id = $1::uuid
        AND bt.voided_at IS NOT NULL
        AND je.status = 'posted'
        AND je.reversed_by_je_id IS NULL
      ORDER BY bt.transaction_date, bt.id
    `,
    [USMCA]
  );
  console.log(`target JEs on VOIDED txns: ${targets.rows.length}`);
  for (const t of targets.rows) console.log(`  ${t.je_id} <- txn ${t.txn_id} :: ${t.memo ?? ""}`);

  if (!COMMIT) {
    console.log("DRY RUN — no --commit, nothing reversed.");
  } else {
    let reversed = 0;
    for (const t of targets.rows) {
      await client.query("BEGIN");
      try {
        const res = await reverseJournalEntryNoFlip(client, {
          operatingCompanyId: USMCA,
          journalEntryId: t.je_id,
          reason: REASON,
          actorUserId: ACTOR_USER_ID,
        });
        await client.query("COMMIT");
        reversed += 1;
        console.log(`${t.je_id}: reversed -> ${res.reversal.reversal_journal_entry_id} (linkage=${res.linkage_written})`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    const after = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM banking.bank_transactions bt
         JOIN accounting.journal_entries je
           ON je.id = bt.matched_journal_entry_id AND je.operating_company_id = bt.operating_company_id
        WHERE bt.operating_company_id = $1::uuid AND bt.voided_at IS NOT NULL
          AND je.status = 'posted' AND je.reversed_by_je_id IS NULL`,
      [USMCA]
    );
    console.log(`REVERSED ${reversed}; remaining unreversed JEs on voided txns: ${after.rows[0].n}`);
  }
} finally {
  client.release();
  await pool.end();
}
