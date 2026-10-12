/**
 * ROUND 443.66-C — Relay Fuel Wallet list suggestions (read-only).
 *
 * OUT (debit): key = Relay `txn_*` in the bank description → its Relay-fill expense
 *   (fee-inclusive: bank may equal expense, or expense − sender fee).
 * IN (credit): suggest the matchable Relay deposit document by wallet leg or charged total.
 *   Held deposits with no document yet → gap reason, never a guessed account.
 *
 * Never posts. Never writes matched_* / categorized_*. Owner accepts through Match drawer.
 */
import { withLuciaBypass } from "../../auth/db.js";
import { RELAY_DEPOSIT_MATCHABLE_SQL, RELAY_DEPOSIT_WALLET_AMOUNT_SQL } from "./relay-deposit-match-math.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export type RelayWalletSuggestHit = {
  suggested_ledger_entry_kind: "expense" | "relay_deposit";
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

export type RelayWalletSuggestResult = {
  /** False when this bank line is not on Relay Fuel Wallet — caller uses the general matcher. */
  applies: boolean;
  suggestion: RelayWalletSuggestHit | null;
  /** When applies && !suggestion — why (no document, several, held card pending, …). */
  gap_reason?: string;
};

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 999;
  return Math.abs(Math.round(ms / 86_400_000));
}

function parseRelayTxnId(description: string | null | undefined): string | null {
  const m = String(description ?? "").match(/\b(txn_[A-Za-z0-9]+)\b/);
  return m?.[1] ?? null;
}

function feeInclusiveExact(bankAbs: number, docAbs: number, feeCents: number): boolean {
  if (docAbs === bankAbs) return true;
  if (feeCents <= 0) return false;
  return docAbs - feeCents === bankAbs || docAbs + feeCents === bankAbs;
}

/**
 * Read-only suggestion for one bank line on Relay Fuel Wallet (1295).
 * Returns `applies: false` for every other bank account.
 */
export async function suggestRelayWalletLine(input: {
  operating_company_id: string;
  bank_transaction_id: string;
}): Promise<RelayWalletSuggestResult> {
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
    }>(
      `SELECT bt.id::text, bt.amount_cents::int, bt.is_credit, bt.transaction_date::text,
              bt.description, ba.account_name, a.account_number
         FROM banking.bank_transactions bt
         JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
         LEFT JOIN catalogs.accounts a ON a.id = ba.ledger_account_id
        WHERE bt.id = $1::uuid AND bt.operating_company_id = $2::uuid AND bt.voided_at IS NULL
        LIMIT 1`,
      [input.bank_transaction_id, input.operating_company_id]
    );
    const txn = txnRes.rows[0];
    if (!txn) return { applies: false, suggestion: null };

    const isRelayWallet =
      txn.account_number === "1295" || /relay\s*fuel\s*wallet/i.test(txn.account_name ?? "");
    if (!isRelayWallet) return { applies: false, suggestion: null };

    const bankAbs = Math.abs(Number(txn.amount_cents));
    if (bankAbs <= 0) return { applies: true, suggestion: null, gap_reason: "zero_amount" };

    // --- MONEY OUT → Relay-fill expense (txn_id key, else date+amount 1:1) -------------
    if (!txn.is_credit) {
      const txnId = parseRelayTxnId(txn.description);
      const feeSql = `COALESCE((SELECT round(sum((f->>'amount')::numeric) * 100) FROM jsonb_array_elements(COALESCE(r.fees, '[]'::jsonb)) f), 0)::int`;

      type ExpRow = {
        id: string;
        amt: number;
        fee_cents: number;
        event_date: string;
        ref: string | null;
        payee: string | null;
      };

      let rows: ExpRow[] = [];
      if (txnId) {
        const byTxn = await client.query<ExpRow>(
          `SELECT e.id::text, e.total_amount_cents::int AS amt, ${feeSql} AS fee_cents,
                  e.transaction_date::text AS event_date,
                  COALESCE(e.expense_number, e.memo)::text AS ref,
                  v.vendor_name::text AS payee
             FROM integrations.relay_fuel_transactions r
             JOIN fuel.fuel_transactions ft ON ft.relay_fuel_transaction_id = r.id AND ft.voided_at IS NULL
             JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id
              AND e.voided_at IS NULL AND e.is_active = true AND e.status = 'posted'
             LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
            WHERE r.operating_company_id = $1::uuid
              AND r.transaction_id = $2
              AND r.voided_at IS NULL
            UNION
           SELECT e.id::text, e.total_amount_cents::int AS amt, ${feeSql} AS fee_cents,
                  e.transaction_date::text AS event_date,
                  COALESCE(e.expense_number, e.memo)::text AS ref,
                  v.vendor_name::text AS payee
             FROM integrations.relay_fuel_transactions r
             JOIN accounting.expenses e
               ON e.operating_company_id = r.operating_company_id
              AND e.voided_at IS NULL AND e.is_active = true AND e.status = 'posted'
              AND e.memo ILIKE '%' || r.id::text || '%'
             LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
            WHERE r.operating_company_id = $1::uuid
              AND r.transaction_id = $2
              AND r.voided_at IS NULL`,
          [input.operating_company_id, txnId]
        );
        rows = byTxn.rows;
      }

      // Fallback: same date ±5d + fee-inclusive amount, payment account 1295.
      if (!rows.length) {
        const byAmt = await client.query<ExpRow>(
          `SELECT e.id::text, e.total_amount_cents::int AS amt,
                  COALESCE((
                    SELECT COALESCE((SELECT round(sum((f->>'amount')::numeric) * 100)
                                      FROM jsonb_array_elements(COALESCE(rf.fees, '[]'::jsonb)) f), 0)::int
                      FROM fuel.fuel_transactions ft
                      JOIN integrations.relay_fuel_transactions rf ON rf.id = ft.relay_fuel_transaction_id
                     WHERE ft.id = e.source_fuel_transaction_id
                     LIMIT 1
                  ), 200)::int AS fee_cents,
                  e.transaction_date::text AS event_date,
                  COALESCE(e.expense_number, e.memo)::text AS ref,
                  v.vendor_name::text AS payee
             FROM accounting.expenses e
             JOIN catalogs.accounts a ON a.id = e.payment_account_uuid AND a.account_number = '1295'
             LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
            WHERE e.operating_company_id = $1::uuid
              AND e.voided_at IS NULL AND e.is_active = true AND e.status = 'posted'
              AND e.transaction_date BETWEEN $2::date - 5 AND $2::date + 5
              AND (
                e.total_amount_cents = $3
                OR e.total_amount_cents = $3 + 200
                OR e.total_amount_cents = $3 - 200
              )
              AND NOT EXISTS (
                SELECT 1 FROM banking.reconciliation_matches m
                 WHERE m.ledger_entry_kind = 'expense' AND m.ledger_entry_id = e.id
                   AND m.match_state IN ('auto_matched', 'user_matched')
              )`,
          [input.operating_company_id, txn.transaction_date, bankAbs]
        );
        rows = byAmt.rows.filter((r) => feeInclusiveExact(bankAbs, Math.abs(r.amt), Number(r.fee_cents)));
      }

      const exact = rows.filter((r) => feeInclusiveExact(bankAbs, Math.abs(r.amt), Number(r.fee_cents)));
      // Deduplicate UNION doubles
      const seen = new Set<string>();
      const uniq = exact.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

      if (uniq.length === 0) {
        if (txnId) {
          const fillOnly = await client.query<{ id: string }>(
            `SELECT r.id::text FROM integrations.relay_fuel_transactions r
              WHERE r.operating_company_id = $1::uuid AND r.transaction_id = $2 AND r.voided_at IS NULL LIMIT 1`,
            [input.operating_company_id, txnId]
          );
          if (fillOnly.rows[0]) {
            return { applies: true, suggestion: null, gap_reason: "fill_exists_no_expense_document" };
          }
        }
        return { applies: true, suggestion: null, gap_reason: "no_relay_fill_expense" };
      }
      if (uniq.length > 1) {
        return {
          applies: true,
          suggestion: null,
          gap_reason: `several_expenses:${uniq.map((r) => r.id).join(",")}`,
        };
      }
      const pick = uniq[0]!;
      return {
        applies: true,
        suggestion: {
          suggested_ledger_entry_kind: "expense",
          suggested_ledger_entry_id: pick.id,
          suggested_confidence: txnId ? "high" : "medium",
          date_gap_days: daysBetween(txn.transaction_date, pick.event_date),
          memo_similarity: txnId ? 1 : 0.5,
          suggested_event_date: pick.event_date,
          suggested_amount_cents: Math.abs(pick.amt),
          suggested_payee_name: pick.payee,
          suggested_reference: pick.ref,
          suggested_match_count: 1,
        },
      };
    }

    // --- MONEY IN → Relay deposit document --------------------------------------------
    const deps = await client.query<{
      id: string;
      ref: string | null;
      event_date: string;
      charged: number;
      wallet: number | null;
      matchable: boolean;
      last4: string | null;
    }>(
      `SELECT rd.id::text, rd.deposit_id AS ref,
              COALESCE(rd.relay_created_at, rd.created_at)::date::text AS event_date,
              rd.total_amount_cents::int AS charged,
              ${RELAY_DEPOSIT_WALLET_AMOUNT_SQL}::int AS wallet,
              (${RELAY_DEPOSIT_MATCHABLE_SQL}) AS matchable,
              rd.funding_card_last4 AS last4
         FROM integrations.relay_deposits rd
        WHERE rd.operating_company_id = $1::uuid
          AND rd.voided_at IS NULL
          AND COALESCE(rd.is_active, true) = true
          AND rd.status = 'settled'
          AND COALESCE(rd.relay_created_at, rd.created_at)::date
                BETWEEN $2::date - 5 AND $2::date + 2
          AND (
            rd.total_amount_cents = $3
            OR ${RELAY_DEPOSIT_WALLET_AMOUNT_SQL} = $3
          )
          AND rd.matched_bank_transaction_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM banking.bank_transactions bt
             WHERE bt.matched_relay_deposit_id = rd.id AND bt.voided_at IS NULL
          )`,
      [input.operating_company_id, txn.transaction_date, bankAbs]
    );

    const matchable = deps.rows.filter((d) => d.matchable);
    const held = deps.rows.filter((d) => !d.matchable);

    if (matchable.length === 1) {
      const pick = matchable[0]!;
      return {
        applies: true,
        suggestion: {
          suggested_ledger_entry_kind: "relay_deposit",
          suggested_ledger_entry_id: pick.id,
          suggested_confidence: "high",
          date_gap_days: daysBetween(txn.transaction_date, pick.event_date),
          memo_similarity: 0.9,
          suggested_event_date: pick.event_date,
          suggested_amount_cents: Math.abs(Number(pick.wallet ?? pick.charged)),
          suggested_payee_name: "Relay",
          suggested_reference: pick.ref,
          suggested_match_count: 1,
        },
      };
    }
    if (matchable.length > 1) {
      return {
        applies: true,
        suggestion: null,
        gap_reason: `several_deposits:${matchable.map((d) => d.id).join(",")}`,
      };
    }
    if (held.length >= 1) {
      const cards = [...new Set(held.map((h) => h.last4).filter(Boolean))];
      return {
        applies: true,
        suggestion: null,
        gap_reason: `no_document_card_owner_pending:${cards.join(",") || "unknown"}`,
      };
    }
    return { applies: true, suggestion: null, gap_reason: "no_relay_deposit" };
  });
}

/** Live proof helper — USMCA constant kept for guards/tests. */
export const RELAY_WALLET_SUGGEST_USMCA = USMCA;
