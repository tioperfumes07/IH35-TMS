#!/usr/bin/env npx tsx
/**
 * ENG-04 (443.322) — dry-run only. For CA-2026-0001..0012 ($2,575.96 Cr on 2170),
 * find read-only payment evidence (bank line near amount+date) and propose
 * Dr 2170 / Cr <bank GL> reclass. Never posts. Lead applies after review.
 *
 * ACCT-F11091 (2026-11-03): the first version read EVERY bank line (voided pending lines, lines merged
 * into their posted twin, lines already matched/categorized), dated lines by posted_date only, and let
 * one bank line be the "unique" evidence for two advances. Its $705.97 proposal (CA-0004/0006/0007)
 * rested on two voided pending lines, one of them claimed twice. The SQL now returns raw candidate
 * lines with their state; scripts/lib/eng04-advance-bank-evidence.mjs applies the eligibility and
 * exclusivity rules (guard: scripts/verify-eng04-advance-bank-evidence.mjs).
 *
 *   DATABASE_URL="$(head -1 ~/Downloads/lead-tmp/.prod)" npx tsx scripts/ops/2026-10-26-eng-04-2170-advance-reclass-dry-run.mts
 */
import pg from "pg";
import { classifyAdvanceBankEvidence } from "../lib/eng04-advance-bank-evidence.mjs";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DISPLAY_RE = "^CA-2026-00(0[1-9]|1[0-2])$";
const WINDOW_DAYS = 21;

type AdvRow = { advance_id: string; display_id: string; amount_cents: string; book_date: string; clearing_credit_cents: string };
type LineRow = {
  id: string;
  amount_cents: string;
  posted_date: string | null;
  transaction_date: string | null;
  voided_at: string | null;
  merged_into_bank_transaction_id: string | null;
  already_matched: boolean;
  bank_ledger_account_id: string | null;
  bank_ledger_number: string | null;
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
    const adv = await client.query<AdvRow>(
      `
      SELECT a.id::text AS advance_id,
             a.display_id,
             round(a.amount * 100)::bigint::text AS amount_cents,
             coalesce(a.posting_date, a.created_at::date)::date::text AS book_date,
             coalesce((SELECT sum(jep.amount_cents) FILTER (WHERE jep.debit_or_credit = 'credit')
                         FROM accounting.journal_entry_postings jep
                         JOIN catalogs.accounts c ON c.id = jep.account_id AND c.account_number = '2170'
                        WHERE jep.operating_company_id = $1::uuid
                          AND jep.source_transaction_type = 'driver_advance'
                          AND jep.source_transaction_id::text = a.id::text), 0)::bigint::text AS clearing_credit_cents
        FROM driver_finance.driver_advances a
       WHERE a.operating_company_id = $1::uuid
         AND a.display_id ~ $2
         AND a.voided_at IS NULL
       ORDER BY a.display_id
      `,
      [USMCA, DISPLAY_RE]
    );
    const amounts = [...new Set(adv.rows.map((r) => -Number(r.amount_cents)))];
    // Raw candidates by amount only — every eligibility rule (voided, merged, outflow, already matched,
    // posted_date ?? transaction_date, window, exclusivity) lives in the shared classifier.
    const lines = await client.query<LineRow>(
      `
      SELECT bt.id::text AS id,
             bt.amount_cents::text AS amount_cents,
             bt.posted_date::text AS posted_date,
             bt.transaction_date::text AS transaction_date,
             bt.voided_at::text AS voided_at,
             bt.merged_into_bank_transaction_id::text AS merged_into_bank_transaction_id,
             (bt.matched_advance_id IS NOT NULL OR bt.matched_bill_payment_id IS NOT NULL
              OR bt.matched_journal_entry_id IS NOT NULL OR bt.matched_expense_id IS NOT NULL
              OR bt.matched_bill_id IS NOT NULL OR bt.coa_account_id IS NOT NULL
              OR bt.categorization_gl_account_id IS NOT NULL) AS already_matched,
             ba.ledger_account_id::text AS bank_ledger_account_id,
             acct.account_number AS bank_ledger_number
        FROM banking.bank_transactions bt
        LEFT JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id AND ba.operating_company_id = $1::uuid
        LEFT JOIN catalogs.accounts acct ON acct.id = ba.ledger_account_id
       WHERE bt.operating_company_id = $1::uuid
         AND bt.amount_cents = ANY($2::bigint[])
      `,
      [USMCA, amounts]
    );
    const classified = classifyAdvanceBankEvidence(adv.rows, lines.rows, { windowDays: WINDOW_DAYS });
    const clearingById = new Map(adv.rows.map((r) => [r.advance_id, Number(r.clearing_credit_cents)]));
    const proposals = classified.map((p) => ({
      ...p,
      clearing_credit_cents: clearingById.get(p.advance_id) ?? 0,
      proposed_reclass:
        p.action === "PROPOSE_RECLASS"
          ? {
              dr_account: "2170",
              cr_account_id: p.bank_ledger_account_id,
              cr_account_number: p.bank_ledger_number,
              amount_cents: p.amount_cents,
              memo: `ENG-04 reclass ${p.display_id}: move advance credit off Driver Net-Pay Clearing onto bank evidence ${p.bank_match_id}`,
            }
          : null,
    }));
    const count = (e: string) => proposals.filter((p) => p.evidence === e).length;
    const summary = {
      dry_run: true,
      engine: "ENG-04",
      usmca: USMCA,
      advances: proposals.length,
      propose_reclass: proposals.filter((p) => p.action === "PROPOSE_RECLASS").length,
      unique: count("BANK_UNIQUE"),
      contested: count("BANK_CONTESTED"),
      ambiguous: count("BANK_AMBIGUOUS"),
      no_evidence: count("NO_EVIDENCE"),
      proposed_total_cents: proposals.reduce((s, p) => s + (p.proposed_reclass?.amount_cents ?? 0), 0),
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
