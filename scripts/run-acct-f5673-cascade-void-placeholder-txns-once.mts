/**
 * ACCT-F5673 BACKFILL — run the bill-void → source-bank-txn cascade for bills voided BEFORE the
 * cascade existed. Measured live 2026-08-20: 24 USMCA insurance-wizard placeholder txns (two
 * policies × 12 installments, $2,100.00) categorized + linked to VOID bills, 0 JEs.
 *
 * Runs through the EXACT shipped code path (cascadeBillVoidToSourceBankTransactions imported from
 * bills.service.ts) — never a hand-written UPDATE. Idempotent: the cascade's own predicates
 * (voided_at IS NULL / matched_journal_entry_id IS NULL) make a re-run a no-op.
 *
 * Usage:
 *   DATABASE_URL=<direct> DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-acct-f5673-cascade-void-placeholder-txns-once.mts [--commit]
 * Without --commit: read-only preview of the affected bills/txns.
 */
import pg from "pg";
import { cascadeBillVoidToSourceBankTransactions } from "../apps/backend/src/accounting/bills.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  const who = await client.query<{ u: string }>(`SELECT current_user AS u`);
  console.log(`current_user=${who.rows[0].u}`);

  const stranded = await client.query<{ bill_id: string; txn_count: string }>(
    `
      SELECT b.id::text AS bill_id, COUNT(bt.id)::text AS txn_count
      FROM accounting.bills b
      JOIN banking.bank_transactions bt
        ON bt.linked_entity_id = b.id
       AND bt.operating_company_id = b.operating_company_id
      WHERE b.operating_company_id = $1::uuid
        AND b.status IN ('void', 'voided')
        AND bt.voided_at IS NULL
        AND bt.matched_journal_entry_id IS NULL
      GROUP BY b.id
      ORDER BY b.id
    `,
    [USMCA]
  );
  console.log(`stranded void bills: ${stranded.rows.length} (txns: ${stranded.rows.reduce((s, r) => s + Number(r.txn_count), 0)})`);

  if (!COMMIT) {
    console.log("DRY RUN — no --commit, nothing changed.");
  } else {
    let voided = 0;
    let reverted = 0;
    await client.query("BEGIN");
    try {
      for (const row of stranded.rows) {
        const res = await cascadeBillVoidToSourceBankTransactions(client, {
          operatingCompanyId: USMCA,
          billId: row.bill_id,
          userId: ACTOR_USER_ID,
          reason: "ACCT-F5673 backfill: bill was voided before the cascade existed",
        });
        voided += res.voided_placeholder_count;
        reverted += res.reverted_feed_line_count;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log(`CASCADED: voided_placeholders=${voided} reverted_feed_lines=${reverted}`);
    const after = await client.query<{ stuck: string }>(
      `SELECT COUNT(*)::text AS stuck FROM banking.bank_transactions bt
        WHERE bt.operating_company_id = $1::uuid AND bt.status='categorized'
          AND bt.matched_journal_entry_id IS NULL AND bt.voided_at IS NULL`,
      [USMCA]
    );
    console.log(`AFTER: live stuck backlog=${after.rows[0].stuck}`);
  }
} finally {
  client.release();
  await pool.end();
}
