#!/usr/bin/env npx tsx
/**
 * ENG-04 (443.322) — dry-run only. For CA-2026-0001..0012 ($2,575.96 Cr on 2170),
 * find read-only payment evidence (bank line near amount+date) and propose
 * Dr 2170 / Cr <bank GL> reclass. Never posts. Lead applies after review.
 *
 *   DATABASE_URL="$(head -1 ~/Downloads/lead-tmp/.prod)" npx tsx scripts/ops/2026-10-26-eng-04-2170-advance-reclass-dry-run.mts
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DISPLAY_RE = "^CA-2026-00(0[1-9]|1[0-2])$";

type Row = {
  display_id: string;
  advance_id: string;
  amount_cents: string;
  book_date: string;
  from_bank_account_id: string | null;
  bank_match_id: string | null;
  bank_match_date: string | null;
  bank_ledger_account_id: string | null;
  bank_ledger_number: string | null;
  bank_match_count: string;
  clearing_credit_cents: string;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query(`SET LOCAL app.current_entity_id = '${USMCA}'`);

    const { rows } = await client.query<Row>(
      `
      WITH adv AS (
        SELECT a.id AS advance_id,
               a.display_id,
               round(a.amount * 100)::bigint AS amount_cents,
               coalesce(a.posting_date, a.created_at::date) AS book_date,
               a.from_bank_account_id
          FROM driver_finance.driver_advances a
         WHERE a.operating_company_id = $1::uuid
           AND a.display_id ~ $2
           AND a.voided_at IS NULL
      ),
      bank AS (
        SELECT adv.advance_id,
               count(bt.id)::int AS bank_match_count,
               (array_agg(bt.id ORDER BY abs(bt.posted_date - adv.book_date), bt.id))[1]::text AS bank_match_id,
               (array_agg(bt.posted_date ORDER BY abs(bt.posted_date - adv.book_date), bt.id))[1]::text AS bank_match_date,
               (array_agg(ba.ledger_account_id ORDER BY abs(bt.posted_date - adv.book_date), bt.id))[1]::text AS bank_ledger_account_id,
               (array_agg(acct.account_number ORDER BY abs(bt.posted_date - adv.book_date), bt.id))[1]::text AS bank_ledger_number
          FROM adv
          LEFT JOIN banking.bank_transactions bt
            ON bt.operating_company_id = $1::uuid
           AND abs(bt.amount_cents) = adv.amount_cents
           AND bt.posted_date BETWEEN adv.book_date - 21 AND adv.book_date + 21
          LEFT JOIN banking.bank_accounts ba
            ON ba.id = bt.bank_account_id AND ba.operating_company_id = $1::uuid
          LEFT JOIN catalogs.accounts acct
            ON acct.id = ba.ledger_account_id
         GROUP BY adv.advance_id
      ),
      clearing AS (
        SELECT jep.source_transaction_id AS advance_id_text,
               sum(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END)::bigint AS clearing_credit_cents
          FROM accounting.journal_entry_postings jep
          JOIN catalogs.accounts a ON a.id = jep.account_id AND a.account_number = '2170'
         WHERE jep.operating_company_id = $1::uuid
           AND jep.source_transaction_type = 'driver_advance'
         GROUP BY 1
      )
      SELECT adv.display_id,
             adv.advance_id::text,
             adv.amount_cents::text,
             adv.book_date::text,
             adv.from_bank_account_id::text,
             bank.bank_match_id,
             bank.bank_match_date,
             bank.bank_ledger_account_id,
             bank.bank_ledger_number,
             bank.bank_match_count::text,
             coalesce(clearing.clearing_credit_cents, 0)::text AS clearing_credit_cents
        FROM adv
        LEFT JOIN bank ON bank.advance_id = adv.advance_id
        LEFT JOIN clearing ON clearing.advance_id_text = adv.advance_id::text
       ORDER BY adv.display_id
      `,
      [USMCA, DISPLAY_RE]
    );

    const proposals = rows.map((r) => {
      const amount = Number(r.amount_cents);
      const evidence =
        r.bank_match_id && Number(r.bank_match_count) === 1
          ? "BANK_UNIQUE"
          : r.bank_match_id && Number(r.bank_match_count) > 1
            ? "BANK_AMBIGUOUS"
            : "NO-EVIDENCE";
      return {
        display_id: r.display_id,
        advance_id: r.advance_id,
        amount_cents: amount,
        book_date: r.book_date,
        clearing_credit_cents: Number(r.clearing_credit_cents),
        evidence,
        bank_match_id: r.bank_match_id,
        bank_match_date: r.bank_match_date,
        bank_match_count: Number(r.bank_match_count),
        proposed_reclass:
          evidence === "BANK_UNIQUE" && r.bank_ledger_account_id
            ? {
                dr_account: "2170",
                cr_account_id: r.bank_ledger_account_id,
                cr_account_number: r.bank_ledger_number,
                amount_cents: amount,
                memo: `ENG-04 reclass ${r.display_id}: move advance credit off Driver Net-Pay Clearing onto bank evidence ${r.bank_match_id}`,
              }
            : null,
        action: evidence === "BANK_UNIQUE" ? "PROPOSE_RECLASS" : "LEAVE",
      };
    });

    const summary = {
      dry_run: true,
      engine: "ENG-04",
      usmca: USMCA,
      advances: proposals.length,
      propose_reclass: proposals.filter((p) => p.action === "PROPOSE_RECLASS").length,
      no_evidence: proposals.filter((p) => p.evidence === "NO-EVIDENCE").length,
      ambiguous: proposals.filter((p) => p.evidence === "BANK_AMBIGUOUS").length,
      proposed_total_cents: proposals
        .filter((p) => p.proposed_reclass)
        .reduce((s, p) => s + (p.proposed_reclass?.amount_cents ?? 0), 0),
      rows: proposals,
    };
    console.log(JSON.stringify(summary, null, 2));
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
