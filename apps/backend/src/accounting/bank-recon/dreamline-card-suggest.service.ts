/**
 * ROUND 443.66-C — Dreamline Diesel Card list suggestions (read-only).
 *
 * Card statement lines carry the discounted price; the expense is the pump receipt.
 * Same store city + date window + invoice group within the card-pricing band
 * (max($3.00, 12%) gap; accept-time cap CARD_DISCOUNT_MAX_PCT) → suggest the expense.
 *
 * Never posts. Never writes matched_* / categorized_*. Owner accepts through Match drawer.
 */
import { withLuciaBypass } from "../../auth/db.js";

/** Same cap as match.service CARD_DISCOUNT_MAX_PCT — inline to avoid circular import weight. */
const CARD_DISCOUNT_MAX_PCT = 8;

export type DreamlineCardSuggestHit = {
  suggested_ledger_entry_kind: "expense";
  suggested_ledger_entry_id: string;
  suggested_confidence: "high" | "medium";
  date_gap_days: number;
  memo_similarity: number;
  suggested_event_date: string | null;
  suggested_amount_cents: number;
  suggested_payee_name: string | null;
  suggested_reference: string | null;
  suggested_match_count: number;
};

export type DreamlineCardSuggestResult = {
  /** False when this bank line is not Dreamline Diesel Card — caller uses the general matcher. */
  applies: boolean;
  suggestion: DreamlineCardSuggestHit | null;
  gap_reason?: string;
};

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 999;
  return Math.abs(Math.round(ms / 86_400_000));
}

function parseStoreCity(description: string | null | undefined): string | null {
  const m = /\s([A-Z][A-Z.'-]+)\s+([A-Z]{2})\s*$/.exec(String(description ?? "").toUpperCase().trim());
  return m?.[1] ?? null;
}

/**
 * Read-only suggestion for one Dreamline Diesel Card bank line.
 * Returns `applies: false` for every other bank account.
 */
export async function suggestDreamlineCardLine(input: {
  operating_company_id: string;
  bank_transaction_id: string;
}): Promise<DreamlineCardSuggestResult> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const txnRes = await client.query<{
      id: string;
      amount_cents: number;
      is_credit: boolean;
      transaction_date: string;
      description: string | null;
      account_name: string | null;
      account_number: string | null;
      ledger_account_id: string | null;
    }>(
      `SELECT bt.id::text, bt.amount_cents::int, bt.is_credit, bt.transaction_date::text,
              bt.description, ba.account_name, a.account_number, ba.ledger_account_id::text
         FROM banking.bank_transactions bt
         JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
         LEFT JOIN catalogs.accounts a ON a.id = ba.ledger_account_id AND a.operating_company_id = bt.operating_company_id
        WHERE bt.id = $1::uuid AND bt.operating_company_id = $2::uuid AND bt.voided_at IS NULL
        LIMIT 1`,
      [input.bank_transaction_id, input.operating_company_id]
    );
    const txn = txnRes.rows[0];
    if (!txn) return { applies: false, suggestion: null };

    const isDreamline =
      txn.account_number === "2510" || /dreamline/i.test(txn.account_name ?? "");
    if (!isDreamline) return { applies: false, suggestion: null };

    if (txn.is_credit) {
      return { applies: true, suggestion: null, gap_reason: "dreamline_credit_no_expense_match" };
    }

    const bankAbs = Math.abs(Number(txn.amount_cents));
    if (bankAbs <= 0) return { applies: true, suggestion: null, gap_reason: "zero_amount" };
    if (!txn.ledger_account_id) {
      return { applies: true, suggestion: null, gap_reason: "dreamline_ledger_account_missing" };
    }

    const city = parseStoreCity(txn.description);
    if (!city) {
      return { applies: true, suggestion: null, gap_reason: "dreamline_store_city_unparsed" };
    }

    type GroupRow = {
      inv: string;
      ids: string[];
      refs: string[];
      amts: number[];
      dates: string[];
      payees: (string | null)[];
      amt: number;
    };

    const groups = await client.query<GroupRow>(
      `SELECT regexp_replace(btrim(coalesce(ft.transaction_reference, e.id::text)), '-1[0-9]{4}$', '') AS inv,
              array_agg(e.id::text ORDER BY e.total_amount_cents DESC) AS ids,
              array_agg(coalesce(e.expense_number, '') ORDER BY e.total_amount_cents DESC) AS refs,
              array_agg(e.total_amount_cents::int ORDER BY e.total_amount_cents DESC) AS amts,
              array_agg(e.transaction_date::text ORDER BY e.total_amount_cents DESC) AS dates,
              array_agg(v.vendor_name::text ORDER BY e.total_amount_cents DESC) AS payees,
              sum(e.total_amount_cents)::int AS amt
         FROM accounting.expenses e
         JOIN fuel.fuel_transactions ft ON ft.id = e.source_fuel_transaction_id
         LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid AND v.operating_company_id = e.operating_company_id
        WHERE e.operating_company_id = $1::uuid
          AND e.payment_account_uuid = $2::uuid
          AND e.voided_at IS NULL AND e.is_active = true AND e.status = 'posted'
          AND ft.voided_at IS NULL
          AND e.transaction_date BETWEEN $3::date - 2 AND $3::date + 1
          AND upper(coalesce(ft.location_city, '')) LIKE '%' || $4 || '%'
          AND NOT EXISTS (
            SELECT 1 FROM banking.reconciliation_matches m
             WHERE m.ledger_entry_kind = 'expense' AND m.ledger_entry_id = e.id
               AND m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched')
          )
        GROUP BY 1`,
      [input.operating_company_id, txn.ledger_account_id, txn.transaction_date, city]
    );

    const band = (amt: number) => Math.abs(amt - bankAbs) <= Math.max(300, Math.round(amt * 0.12));
    let fits = groups.rows.filter((g) => band(g.amt));

    // Product-split statement lines: member of a receipt that fits alone.
    if (!fits.length) {
      const members: GroupRow[] = [];
      for (const g of groups.rows) {
        for (let i = 0; i < g.ids.length; i++) {
          const amt = Number(g.amts[i] ?? 0);
          if (!band(amt)) continue;
          members.push({
            inv: g.refs[i] || g.ids[i]!,
            ids: [g.ids[i]!],
            refs: [g.refs[i] ?? ""],
            amts: [amt],
            dates: [g.dates[i] ?? txn.transaction_date],
            payees: [g.payees[i] ?? null],
            amt,
          });
        }
      }
      fits = members;
    }

    const exactG = fits.filter((g) => g.amt === bankAbs);
    const pick = exactG.length === 1 ? [exactG[0]!] : fits;

    if (pick.length === 0) {
      if (groups.rows.length === 0) {
        return { applies: true, suggestion: null, gap_reason: `dreamline_no_expense_at_store:${city}` };
      }
      return { applies: true, suggestion: null, gap_reason: `dreamline_no_amount_band:${city}` };
    }
    if (pick.length > 1) {
      return {
        applies: true,
        suggestion: null,
        gap_reason: `several_expenses:${pick.map((g) => g.ids.join("+")).join(",")}`,
      };
    }

    const g = pick[0]!;
    // Prefer single-member; for multi-member invoice group suggest the largest member (drawer can expand).
    const id = g.ids[0]!;
    const withinCap = g.amt >= bankAbs && (g.amt - bankAbs) * 100 <= g.amt * CARD_DISCOUNT_MAX_PCT;
    return {
      applies: true,
      suggestion: {
        suggested_ledger_entry_kind: "expense",
        suggested_ledger_entry_id: id,
        suggested_confidence: withinCap || g.amt === bankAbs ? "high" : "medium",
        date_gap_days: daysBetween(txn.transaction_date, g.dates[0] ?? txn.transaction_date),
        memo_similarity: 0.7,
        suggested_event_date: g.dates[0] ?? null,
        suggested_amount_cents: Math.abs(Number(g.amts[0] ?? g.amt)),
        suggested_payee_name: g.payees[0] ?? null,
        suggested_reference: g.refs[0] || g.inv,
        suggested_match_count: g.ids.length,
      },
    };
  });
}
