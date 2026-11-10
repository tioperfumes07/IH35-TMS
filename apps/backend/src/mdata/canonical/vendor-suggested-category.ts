/**
 * Register row 97 — "All 30 vendors with transactions have no category."
 *
 * A vendor's saved category is mdata.vendors.default_expense_account_id (Option-B RECOMMENDATION ONLY: it pre-fills the
 * account on a new bill line, never auto-posts). Most vendors that already have expenses never had it set, so the board
 * and profile showed nothing to save. This read proposes it from what the books already say: the account most of the
 * vendor's LIVE expenses post to, with its share ("5000 Fuel & Diesel · 98% of 865 expenses"). Read only. The user
 * accepts it with one click, which PATCHes /api/v1/mdata/vendors/:id (default_expense_account_id); nothing here writes.
 */
import { liveExpense } from "../../accounting/live-document-predicates.sql.js";

type Q = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export type VendorSuggestedCategory = {
  account_id: string;
  account_number: string | null;
  account_name: string;
  /** "5000 Fuel & Diesel" */
  label: string;
  /** Live expenses of the vendor with at least one line on this account. */
  expenses: number;
  /** All live expenses of the vendor. */
  total_expenses: number;
  share_pct: number;
  /** The vendor's saved default account, if any. */
  saved_account_id: string | null;
  /** The suggestion equals the saved value: nothing to accept. */
  already_saved: boolean;
};

/** Account types a vendor default may carry (mirrors checkDefaultExpenseAccountIsExpenseType in vendors.routes.ts). */
export const SUGGESTABLE_ACCOUNT_TYPES = ["Expense", "CostOfGoodsSold"] as const;

export function formatSuggestedCategory(s: Pick<VendorSuggestedCategory, "label" | "share_pct" | "total_expenses">): string {
  return `${s.label} · ${s.share_pct}% of ${s.total_expenses} expense${s.total_expenses === 1 ? "" : "s"}`;
}

export const VENDOR_SUGGESTED_CATEGORY_SQL = `
  WITH tot AS (
    SELECT e.vendor_uuid AS vendor_id, count(*)::int AS total
      FROM accounting.expenses e
     WHERE e.operating_company_id = $1::uuid AND ${liveExpense("e")} AND e.vendor_uuid IS NOT NULL
       AND ($2::uuid IS NULL OR e.vendor_uuid = $2::uuid)
     GROUP BY e.vendor_uuid),
  per AS (
    SELECT e.vendor_uuid AS vendor_id, el.expense_account_uuid AS account_id, count(DISTINCT e.id)::int AS n
      FROM accounting.expenses e JOIN accounting.expense_lines el ON el.expense_id = e.id
      JOIN catalogs.accounts a ON a.id = el.expense_account_uuid AND a.operating_company_id = e.operating_company_id
     WHERE e.operating_company_id = $1::uuid AND ${liveExpense("e")} AND e.vendor_uuid IS NOT NULL
       AND ($2::uuid IS NULL OR e.vendor_uuid = $2::uuid)
       AND a.account_type IN ('Expense', 'CostOfGoodsSold') AND a.deactivated_at IS NULL
     GROUP BY e.vendor_uuid, el.expense_account_uuid),
  top AS (
    SELECT DISTINCT ON (vendor_id) vendor_id, account_id, n FROM per ORDER BY vendor_id, n DESC, account_id)
  SELECT top.vendor_id::text AS vendor_id, top.account_id::text AS account_id, a.account_number, a.account_name,
         top.n AS expenses, tot.total AS total_expenses, v.default_expense_account_id::text AS saved_account_id
    FROM top
    JOIN tot ON tot.vendor_id = top.vendor_id
    JOIN catalogs.accounts a ON a.id = top.account_id AND a.operating_company_id = $1::uuid
    JOIN mdata.vendors v ON v.id = top.vendor_id AND v.operating_company_id = $1::uuid`;

/** vendorId omitted = every vendor of the company (the board); given = that vendor (the profile). */
export async function readVendorSuggestedCategories(client: Q, oc: string, vendorId: string | null = null): Promise<Map<string, VendorSuggestedCategory>> {
  const rows = (await client.query(VENDOR_SUGGESTED_CATEGORY_SQL, [oc, vendorId])).rows;
  const out = new Map<string, VendorSuggestedCategory>();
  for (const r of rows) {
    const expenses = Number(r.expenses ?? 0);
    const total = Number(r.total_expenses ?? 0);
    if (!expenses || !total) continue;
    const number = (r.account_number as string | null) ?? null;
    const name = String(r.account_name ?? "");
    const saved = (r.saved_account_id as string | null) ?? null;
    out.set(String(r.vendor_id), {
      account_id: String(r.account_id),
      account_number: number,
      account_name: name,
      label: number ? `${number} ${name}` : name,
      expenses,
      total_expenses: total,
      share_pct: Math.round((expenses / total) * 100),
      saved_account_id: saved,
      already_saved: saved === String(r.account_id),
    });
  }
  return out;
}
