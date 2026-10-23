/**
 * statement-card-credit-repair.service.ts — LEAD 443.258.5 ruling 2 / 443.258.6 / 443.260.5 (CC-2, AUTH-453).
 * OWNER, verbatim 10-22 8:25 PM CT: "REMEMBER FIND THE ROOTCAUSES AND CREATE PERMANENT SOLUTION AND FIX. ALWAYS FIX
 * ENGINES, NEVER DEFER." and 9:55 PM CT: "fix".
 *
 * Every LIVE "Dreamline statement <marker> — Fuel Card Discount" journal entry (handwritten by the old
 * postStatementDifference, tagged fuel_card_discount, not yet reversed) is
 *   1. voided through THE void engine (reverseJournalEntryNoFlip: an equal and opposite reversal JE, audit row), and
 *   2. re-issued as its document through THE expense writer — positive (card charged less) = a card-CREDIT expense
 *      (is_credit, Dr 2510 / Cr Fuel Card Discount, <marker>-CARD-DISC); negative (card charged more) = an ordinary
 *      expense (<marker>-CARD-DIFF) — both carrying the receipt's vendor and load.
 * In BATCHES (default 25): each batch is ONE transaction that refuses (throws → the caller's transaction rolls back)
 * unless, inside it, the net change on 5000 and on 2510 is exactly $0.00 and the trial balance is 0. Idempotent: a
 * reversed statement JE is no longer selected and the writer refuses a second <marker>-CARD-DISC. USMCA only. No DELETE.
 * ONE code path for the owner-only route (POST /api/v1/fuel/statement-discounts/card-credit-repair) and the ops script.
 */
import { reverseJournalEntryNoFlip } from "../accounting/journal-entries.service.js";
import { postStatementCardCreditAsExpense, postStatementCostDifferenceAsExpense } from "./dreamline-statement-import.service.js";

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};
/** Runs fn inside ONE transaction with the company + actor GUCs set and RLS bypass on; commits when fn resolves. */
export type RunInTx = <T>(fn: (client: QueryClient) => Promise<T>) => Promise<T>;

export const STATEMENT_CARD_CREDIT_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA only (AUTH-453 scope)
const REASON = "LEAD 443.258.5 ruling 2: the statement card difference is re-issued as its document (card credit / expense) through the expense writer — the hand-written statement JE is voided by the void engine";

export const LIVE_STATEMENT_DISCOUNT_JES_SQL = `
    SELECT je.id::text AS je, je.entry_date::text, je.memo,
           min(p.source_transaction_id) AS receipt,
           sum(CASE WHEN a.account_number = '5000' THEN (CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END) ELSE 0 END)::text AS cents_5000,
           max(CASE WHEN a.account_number = '5000' THEN p.account_id::text END) AS acct_5000,
           max(CASE WHEN a.account_number <> '5000' THEN p.account_id::text END) AS acct_2510
      FROM accounting.journal_entries je
      JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
      JOIN catalogs.accounts a ON a.id = p.account_id
     WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL AND je.status = 'posted'
       AND je.memo LIKE '% statement % — Fuel Card Discount'
       AND EXISTS (SELECT 1 FROM accounting.transaction_source_links l WHERE l.journal_entry_posting_id = p.id AND l.relationship_role = 'fuel_card_discount')
       AND je.reversed_by_je_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM accounting.journal_entries r WHERE r.reverses_je_id = je.id AND r.voided_at IS NULL)
     GROUP BY je.id, je.entry_date, je.memo
     ORDER BY je.entry_date, je.id`;

export type CardCreditRepairRow = { marker: string; voided_je: string; reversal_je: string; new_je: string; doc: string; cents: number; receipt: string };
export type CardCreditRepairBatch = {
  batch: number; documents: number; cents: number; net_5000_change: number; net_2510_change: number;
  tb_after: { net: string; n: string }; result: "COMMITTED" | "DRY RUN — ROLLED BACK";
};
export type CardCreditRepairResult = {
  dry_run: boolean; batches: CardCreditRepairBatch[]; documents_this_run: number; cents_this_run: number;
  live_statement_discount_jes_left: number; card_credit_docs_total: number; card_credit_cents_total: number;
  tb: { net: string; n: string }; rows: CardCreditRepairRow[];
};

export class CardCreditRepairRefused extends Error {}

const tb = async (c: QueryClient, companyId: string) =>
  (await c.query<{ net: string; n: string }>(
    `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS net, count(*)::text AS n
       FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [companyId])).rows[0]!;
const acctNet = async (c: QueryClient, companyId: string, num: string) =>
  Number((await c.query<{ net: string }>(
    `SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS net
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE p.operating_company_id = $1::uuid AND je.voided_at IS NULL AND a.account_number = $2`, [companyId, num])).rows[0]!.net);

/** One batch inside the caller's transaction. Throws CardCreditRepairRefused on any failed assert (→ rollback). */
async function runBatch(c: QueryClient, input: { companyId: string; actorUserId: string; batch: number; size: number; dryRun: boolean }) {
  const { companyId, actorUserId } = input;
  await c.query("SAVEPOINT card_credit_batch");
  const tbBefore = await tb(c, companyId);
  if (tbBefore.net !== "0") throw new CardCreditRepairRefused(`batch ${input.batch}: TB ${tbBefore.net} before`);
  const b5000 = await acctNet(c, companyId, "5000"), b2510 = await acctNet(c, companyId, "2510");
  const jes = (await c.query<{ je: string; entry_date: string; memo: string; receipt: string; cents_5000: string; acct_5000: string; acct_2510: string }>(
    `${LIVE_STATEMENT_DISCOUNT_JES_SQL} LIMIT ${input.size}`, [companyId])).rows;
  if (!jes.length) { await c.query("ROLLBACK TO SAVEPOINT card_credit_batch"); return null; }
  const item = (await c.query<{ id: string }>(
    `SELECT i.id::text FROM catalogs.items i WHERE i.item_name = 'Fuel Card Discount' AND i.deactivated_at IS NULL
       AND (i.operating_company_id = $1::uuid OR i.operating_company_id IS NULL) ORDER BY (i.operating_company_id = $1::uuid) DESC NULLS LAST LIMIT 1`,
    [companyId])).rows[0]?.id;
  if (!item) throw new CardCreditRepairRefused("Fuel Card Discount item missing");
  const rows: CardCreditRepairRow[] = [];
  for (const j of jes) {
    const marker = /statement (\S+) —/.exec(j.memo)?.[1];
    if (!marker || !j.receipt || !j.acct_5000 || !j.acct_2510) throw new CardCreditRepairRefused(`unreadable statement JE ${j.je} (${j.memo})`);
    const rev = await reverseJournalEntryNoFlip(c as never, { operatingCompanyId: companyId, journalEntryId: j.je, reason: REASON, actorUserId });
    if (!rev.reversal.reversal_journal_entry_id) throw new CardCreditRepairRefused(`${marker} — the void engine wrote no reversal for ${j.je}`);
    const cents = Number(j.cents_5000); // + = card charged less (credit 5000) · − = card charged more (debit 5000)
    const doc = {
      companyId, actor: actorUserId, expenseId: j.receipt, differenceCents: cents, date: j.entry_date.slice(0, 10), marker,
      payableId: j.acct_2510, discountAccountId: j.acct_5000, discountItemId: item,
    };
    const newJe = cents > 0 ? await postStatementCardCreditAsExpense(c as never, doc) : await postStatementCostDifferenceAsExpense(c as never, doc);
    if (!newJe) throw new CardCreditRepairRefused(`${marker} — a document with this statement number already exists (nothing re-issued)`);
    rows.push({ marker, voided_je: j.je, reversal_je: String(rev.reversal.reversal_journal_entry_id), new_je: newJe,
      doc: cents > 0 ? `${marker}-CARD-DISC` : `${marker}-CARD-DIFF`, cents, receipt: j.receipt });
  }
  const tbAfter = await tb(c, companyId);
  const d5000 = (await acctNet(c, companyId, "5000")) - b5000, d2510 = (await acctNet(c, companyId, "2510")) - b2510;
  const bad: string[] = [];
  if (d5000 !== 0) bad.push(`5000 moved ${d5000}`);
  if (d2510 !== 0) bad.push(`2510 moved ${d2510}`);
  if (tbAfter.net !== "0") bad.push(`TB ${tbAfter.net} after`);
  if (bad.length) throw new CardCreditRepairRefused(`batch ${input.batch} rolled back — ${bad.join("; ")}`);
  if (input.dryRun) await c.query("ROLLBACK TO SAVEPOINT card_credit_batch");
  else await c.query("RELEASE SAVEPOINT card_credit_batch");
  const info: CardCreditRepairBatch = {
    batch: input.batch, documents: rows.length, cents: rows.reduce((a, r) => a + r.cents, 0), net_5000_change: d5000,
    net_2510_change: d2510, tb_after: tbAfter, result: input.dryRun ? "DRY RUN — ROLLED BACK" : "COMMITTED",
  };
  return { info, rows };
}

/**
 * The whole repair: batches until none is left (a dry run proves the first batch only — nothing commits, so the next
 * batch would repeat it). Refuses outright when accounting.expenses.is_credit is missing (the writer would post OUT).
 */
export async function runStatementCardCreditRepair(
  runInTx: RunInTx,
  input: { companyId: string; actorUserId: string; dryRun: boolean; batchSize?: number; maxBatches?: number },
): Promise<CardCreditRepairResult> {
  if (input.companyId !== STATEMENT_CARD_CREDIT_COMPANY_ID) throw new CardCreditRepairRefused("AUTH-453 scope is USMCA only");
  const size = Math.max(1, Math.min(100, input.batchSize ?? 25));
  const maxBatches = Math.max(1, input.maxBatches ?? 1000);
  const hasCol = await runInTx(async (c) => (await c.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'accounting' AND table_name = 'expenses' AND column_name = 'is_credit'`)).rows.length > 0);
  if (!hasCol) throw new CardCreditRepairRefused("accounting.expenses.is_credit is missing — 202616190700 is not applied (the writer would post money OUT)");
  const batches: CardCreditRepairBatch[] = [];
  const all: CardCreditRepairRow[] = [];
  for (let b = 1; b <= maxBatches; b++) {
    const r = await runInTx((c) => runBatch(c, { companyId: input.companyId, actorUserId: input.actorUserId, batch: b, size, dryRun: input.dryRun }));
    if (!r) break;
    batches.push(r.info);
    all.push(...r.rows);
    if (input.dryRun) break;
  }
  const summary = await runInTx(async (c) => {
    const left = Number((await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM (${LIVE_STATEMENT_DISCOUNT_JES_SQL}) x`, [input.companyId])).rows[0]!.n);
    const docs = (await c.query<{ n: string; cents: string }>(
      `SELECT count(*)::text AS n, COALESCE(sum(total_amount_cents), 0)::text AS cents FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND is_credit AND voided_at IS NULL AND vendor_document_number LIKE '%-CARD-DISC'`, [input.companyId])).rows[0]!;
    return { left, docs, tb: await tb(c, input.companyId) };
  });
  return {
    dry_run: input.dryRun, batches, documents_this_run: all.length, cents_this_run: all.reduce((a, r) => a + r.cents, 0),
    live_statement_discount_jes_left: summary.left, card_credit_docs_total: Number(summary.docs.n),
    card_credit_cents_total: Number(summary.docs.cents), tb: summary.tb, rows: all,
  };
}
