/**
 * SCENTSX M8 — the day's transactions + end-of-shift drawer count (ROUND L.31 M8; CC2's draft, rewritten by LEAD: it read a table that
 * does not exist — accounting.customer_payments — and booked the over / short to 6400 Trade Shows & Marketing on 1000 Operating Checking).
 *
 * Daily report (D1, READ ONLY): every journal entry ScentsX POSTED on the day, straight from the books — each with the document it
 * came from (invoice, customer payment, deposit, bill, bill payment, expense, refund, journal entry …), its memo and amount — plus the
 * day's totals: sales (credits to Income accounts net of debits), money in and money out of ScentsX's bank and cash accounts.
 *
 * Drawer count (D2): the cash counted in a register (a ScentsX cash_on_hand / petty_cash bank account — 1010 Store Cash Registers by
 * default) against what the books say is in it at the end of that day (the register's ledger balance, posted lines). A difference is
 * booked through the ONE journal-entry writer: short = Dr 6450 Cash Over & Short / Cr the register, over = Dr the register / Cr 6450
 * (migration 202617310100). Counted = books posts nothing.
 */
import type pg from "pg";
import { z } from "zod";
import { scopeToScentsx, ScentsxLinkInvalid } from "./links.service.js";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";

type Q = Pick<pg.PoolClient, "query">;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const dailyReportQuery = z.object({ date: isoDate });
export const drawerCountBody = z.object({
  date: isoDate,
  counted_cents: z.number().int().min(0).max(10_000_000_00),
  bank_account_id: z.string().uuid().optional(),
  memo: z.string().trim().max(500).optional().nullable(),
});

export type DailyEntry = { journal_entry_id: string; source_transaction_type: string | null; source_transaction_id: string | null; memo: string | null; amount_cents: number };

const CASH_TYPES = ["checking", "savings", "money_market", "cash_on_hand", "petty_cash"];

export async function dailyReport(c: Q, q: z.infer<typeof dailyReportQuery>) {
  const co = await scopeToScentsx(c);
  const entries = (await c.query<{ journal_entry_id: string; source_transaction_type: string | null; source_transaction_id: string | null; memo: string | null; amount: string }>(
    `SELECT j.id::text AS journal_entry_id,
            (array_agg(p.source_transaction_type ORDER BY p.id) FILTER (WHERE p.source_transaction_type IS NOT NULL))[1] AS source_transaction_type,
            (array_agg(p.source_transaction_id ORDER BY p.id) FILTER (WHERE p.source_transaction_id IS NOT NULL))[1] AS source_transaction_id,
            j.memo, COALESCE(SUM(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'debit'), 0)::text AS amount
       FROM accounting.journal_entries j JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = j.id
      WHERE j.operating_company_id = $1::uuid AND j.status = 'posted' AND j.entry_date = $2::date
      GROUP BY j.id ORDER BY j.created_at, j.id`,
    [co, q.date])).rows.map((e): DailyEntry => ({ journal_entry_id: e.journal_entry_id, source_transaction_type: e.source_transaction_type,
      source_transaction_id: e.source_transaction_id, memo: e.memo, amount_cents: Number(e.amount) }));
  const t = (await c.query<{ sales: string; cash_in: string; cash_out: string }>(
    `WITH cash AS (SELECT b.ledger_account_id AS id FROM banking.bank_accounts b WHERE b.operating_company_id = $1::uuid AND b.deactivated_at IS NULL
                     AND b.ledger_account_id IS NOT NULL AND b.account_type = ANY($3::text[]))
     SELECT COALESCE(SUM(CASE WHEN a.account_type IN ('Income', 'OtherIncome') THEN (CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END) END), 0)::text AS sales,
            COALESCE(SUM(p.amount_cents) FILTER (WHERE p.account_id IN (SELECT id FROM cash) AND p.debit_or_credit = 'debit'), 0)::text AS cash_in,
            COALESCE(SUM(p.amount_cents) FILTER (WHERE p.account_id IN (SELECT id FROM cash) AND p.debit_or_credit = 'credit'), 0)::text AS cash_out
       FROM accounting.journal_entries j JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = j.id JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE j.operating_company_id = $1::uuid AND j.status = 'posted' AND j.entry_date = $2::date`,
    [co, q.date, CASH_TYPES])).rows[0]!;
  const byType = new Map<string, { count: number; amount_cents: number }>();
  for (const e of entries) {
    const k = e.source_transaction_type ?? "journal_entry";
    const v = byType.get(k) ?? { count: 0, amount_cents: 0 };
    v.count += 1; v.amount_cents += e.amount_cents;
    byType.set(k, v);
  }
  return {
    date: q.date, entries,
    by_type: [...byType.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.amount_cents - a.amount_cents),
    totals: { entries: entries.length, sales_cents: Number(t.sales), cash_in_cents: Number(t.cash_in), cash_out_cents: Number(t.cash_out) },
  };
}

/** The register's ledger balance (posted lines) at the end of the day, in cents (debit-normal). */
async function bookBalance(c: Q, co: string, ledgerId: string, date: string) {
  const r = await c.query<{ b: string }>(
    `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS b
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
      WHERE j.operating_company_id = $1::uuid AND j.status = 'posted' AND p.account_id = $2::uuid AND j.entry_date <= $3::date`,
    [co, ledgerId, date]);
  return Number(r.rows[0]?.b ?? 0);
}

/** What the books say is in a register at the end of a day (read only) — the "expected" side of the count. */
export async function registerBook(c: Q, date: string, bankAccountId: string) {
  const co = await scopeToScentsx(c);
  const r = await c.query<{ ledger: string | null }>(`SELECT ledger_account_id::text AS ledger FROM banking.bank_accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [bankAccountId, co]);
  if (!r.rows[0]?.ledger) throw new ScentsxLinkInvalid("register not found");
  return bookBalance(c, co, r.rows[0].ledger, date);
}

export async function drawerCount(c: Q, actor: { userId: string; role: string }, b: z.infer<typeof drawerCountBody>) {
  const co = await scopeToScentsx(c);
  const reg = (await c.query<{ id: string; name: string; ledger_account_id: string | null; account_type: string }>(
    `SELECT b.id::text, COALESCE(b.display_name, b.account_name) AS name, b.ledger_account_id::text, b.account_type
       FROM banking.bank_accounts b JOIN catalogs.accounts a ON a.id = b.ledger_account_id
      WHERE b.operating_company_id = $1::uuid AND b.deactivated_at IS NULL AND b.account_type IN ('cash_on_hand', 'petty_cash')
        AND ($2::uuid IS NULL OR b.id = $2::uuid)
      ORDER BY (a.account_number = '1010') DESC, a.account_number LIMIT 1`,
    [co, b.bank_account_id ?? null])).rows[0];
  if (!reg || !reg.ledger_account_id) throw new ScentsxLinkInvalid("no ScentsX cash register / petty cash account to count");
  const os = (await c.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = '6450' AND deactivated_at IS NULL LIMIT 1`, [co])).rows[0];
  if (!os) throw new ScentsxLinkInvalid("ScentsX has no 6450 Cash Over & Short account (migration 202617310100)");
  const book = await bookBalance(c, co, reg.ledger_account_id, b.date);
  const variance = b.counted_cents - book;
  const direction = variance > 0 ? "over" : variance < 0 ? "short" : "exact";
  let journalEntryId: string | null = null;
  if (variance !== 0) {
    const abs = Math.abs(variance);
    const memo = b.memo?.trim() || `Drawer count ${b.date} · ${reg.name} · ${direction} $${(abs / 100).toFixed(2)} (counted $${(b.counted_cents / 100).toFixed(2)}, books $${(book / 100).toFixed(2)})`;
    const je = await createJournalEntryOnClient(c as never, {
      operating_company_id: co, entry_date: b.date, memo, source: "manual",
      postings: direction === "short"
        ? [{ account_id: os.id, debit_or_credit: "debit", amount_cents: abs, description: memo }, { account_id: reg.ledger_account_id, debit_or_credit: "credit", amount_cents: abs, description: memo }]
        : [{ account_id: reg.ledger_account_id, debit_or_credit: "debit", amount_cents: abs, description: memo }, { account_id: os.id, debit_or_credit: "credit", amount_cents: abs, description: memo }],
    } as never, actor);
    journalEntryId = je.id;
  }
  return { date: b.date, register: { bank_account_id: reg.id, name: reg.name }, counted_cents: b.counted_cents, book_cents: book, variance_cents: variance, direction, journal_entry_id: journalEntryId };
}
