/**
 * ACCT-F345 — WORM-reverse unreversed bill-payment credits to undeposited funds.
 * Exact JE ids (Neon 2026-08-28 lucia): USMCA e8010d5a + e12d04d9; TRANSP dcbe5700.
 *
 *   DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-acct-f345-reverse-open-1090-billpay-once.mts [--commit]
 */
import pg from "pg";
import { reverseJournalEntryNoFlip } from "../apps/backend/src/accounting/journal-entries.service.ts";

const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--commit");
const REASON = "ACCT-F345: bill_payment last-resort credited receipt-side undeposited funds; WORM reverse; owner 2026-08-28 TRANSP WF 6103";

const TARGETS = [
  { operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80", journalEntryId: "e8010d5a-c9f7-4ac1-9c8a-b72f655d47a5" },
  { operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80", journalEntryId: "e12d04d9-4f17-425a-86ec-79eced789ad4" },
  { operatingCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96", journalEntryId: "dcbe5700-5925-4118-8d4b-ce01485c9f9e" },
];

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  for (const t of TARGETS) {
    const row = await client.query(
      `SELECT id::text, reversed_by_je_id::text AS rev FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [t.journalEntryId, t.operatingCompanyId]
    );
    console.log(`${t.journalEntryId} reversed_by=${row.rows[0]?.rev ?? "NONE"}`);
    if (!COMMIT) continue;
    await client.query("BEGIN");
    try {
      const res = await reverseJournalEntryNoFlip(client, {
        operatingCompanyId: t.operatingCompanyId,
        journalEntryId: t.journalEntryId,
        reason: REASON,
        actorUserId: ACTOR_USER_ID,
      });
      await client.query("COMMIT");
      console.log(`  -> ${res.reversal.reversal_journal_entry_id}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
  if (!COMMIT) console.log("DRY RUN — pass --commit to reverse");
} finally {
  client.release();
  await pool.end();
}
