/**
 * ScentsX General Ledger — ROUND L.31 M16 remainder (owner 2026-11-27 22:54 CT "… accounting, chart of accounts … fully total and
 * complete"). QuickBooks "General Ledger" report: for a period, every ScentsX account with its balance at the start, each posted line in
 * the period (date, document type + id to open it, memo, debit, credit, running balance) and its balance at the end.
 * READ ONLY over accounting.journal_entry_postings (posted entries only, ScentsX company scope) — no GL math, nothing written.
 * The balance is shown on the account's natural side: debit-normal for Asset / Expense / Cost of goods sold / Other expense,
 * credit-normal for Liability / Equity / Income / Other income — the same convention the Trial Balance uses.
 */
import type pg from "pg";
import { z } from "zod";
import { scopeToScentsx } from "./links.service.js";

type Q = Pick<pg.PoolClient, "query">;
export const glQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  account_id: z.string().uuid().optional(),
  include_empty: z.enum(["true", "false"]).optional(),
}).refine((q) => q.from <= q.to, { message: "from must be on or before to" });

const DEBIT_NORMAL = new Set(["Asset", "Expense", "CostOfGoodsSold", "OtherExpense"]);
export const MAX_GL_LINES = 5000;

export type GlLine = {
  posting_id: string; journal_entry_id: string; entry_date: string; memo: string | null; source_transaction_type: string | null;
  source_transaction_id: string | null; debit_cents: number; credit_cents: number; balance_cents: number;
};
export type GlAccount = {
  account_id: string; account_number: string | null; account_name: string; account_type: string; normal_side: "debit" | "credit";
  opening_cents: number; debit_cents: number; credit_cents: number; closing_cents: number; lines: GlLine[];
};

export async function generalLedger(c: Q, q: z.infer<typeof glQuery>) {
  const co = await scopeToScentsx(c);
  const accts = (await c.query<{ id: string; account_number: string | null; account_name: string; account_type: string; opening_dr: string; opening_cr: string }>(
    `SELECT a.id::text, a.account_number, a.account_name, a.account_type,
            COALESCE(SUM(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'debit'), 0)::text AS opening_dr,
            COALESCE(SUM(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'credit'), 0)::text AS opening_cr
       FROM catalogs.accounts a
       LEFT JOIN accounting.journal_entry_postings p ON p.account_id = a.id
        AND EXISTS (SELECT 1 FROM accounting.journal_entries j WHERE j.id = p.journal_entry_uuid AND j.operating_company_id = $1::uuid
                    AND j.status = 'posted' AND j.entry_date < $2::date)
      WHERE a.operating_company_id = $1::uuid AND ($3::uuid IS NULL OR a.id = $3::uuid)
      GROUP BY a.id
      ORDER BY a.account_number NULLS LAST, a.account_name`,
    [co, q.from, q.account_id ?? null]
  )).rows;
  const lines = (await c.query<{
    account_id: string; posting_id: string; journal_entry_id: string; entry_date: string; memo: string | null; debit_or_credit: string;
    amount_cents: string; source_transaction_type: string | null; source_transaction_id: string | null;
  }>(
    `SELECT p.account_id::text, p.id::text AS posting_id, j.id::text AS journal_entry_id, j.entry_date::text, COALESCE(p.description, j.memo) AS memo,
            p.debit_or_credit, p.amount_cents::text, p.source_transaction_type, p.source_transaction_id
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
      WHERE j.operating_company_id = $1::uuid AND j.status = 'posted' AND j.entry_date BETWEEN $2::date AND $3::date
        AND ($4::uuid IS NULL OR p.account_id = $4::uuid)
      ORDER BY j.entry_date, j.created_at, p.id
      LIMIT ${MAX_GL_LINES + 1}`,
    [co, q.from, q.to, q.account_id ?? null]
  )).rows;
  const capped = lines.length > MAX_GL_LINES;
  const byAccount = new Map<string, typeof lines>();
  for (const l of lines.slice(0, MAX_GL_LINES)) {
    const arr = byAccount.get(l.account_id) ?? [];
    arr.push(l);
    byAccount.set(l.account_id, arr);
  }
  const accounts: GlAccount[] = [];
  for (const a of accts) {
    const debitNormal = DEBIT_NORMAL.has(a.account_type);
    const sign = (dr: number, cr: number) => (debitNormal ? dr - cr : cr - dr);
    const opening = sign(Number(a.opening_dr), Number(a.opening_cr));
    let bal = opening;
    let dr = 0;
    let cr = 0;
    const out: GlLine[] = [];
    for (const l of byAccount.get(a.id) ?? []) {
      const amt = Number(l.amount_cents);
      const d = l.debit_or_credit === "debit" ? amt : 0;
      const k = l.debit_or_credit === "credit" ? amt : 0;
      dr += d; cr += k; bal += sign(d, k);
      out.push({ posting_id: l.posting_id, journal_entry_id: l.journal_entry_id, entry_date: l.entry_date, memo: l.memo,
        source_transaction_type: l.source_transaction_type, source_transaction_id: l.source_transaction_id, debit_cents: d, credit_cents: k, balance_cents: bal });
    }
    if (q.include_empty !== "true" && !out.length && opening === 0) continue;
    accounts.push({ account_id: a.id, account_number: a.account_number, account_name: a.account_name, account_type: a.account_type,
      normal_side: debitNormal ? "debit" : "credit", opening_cents: opening, debit_cents: dr, credit_cents: cr, closing_cents: bal, lines: out });
  }
  const totals = accounts.reduce((t, a) => ({ debit_cents: t.debit_cents + a.debit_cents, credit_cents: t.credit_cents + a.credit_cents }), { debit_cents: 0, credit_cents: 0 });
  return { operating_company_id: co, from: q.from, to: q.to, capped, max_lines: MAX_GL_LINES, totals, accounts };
}
