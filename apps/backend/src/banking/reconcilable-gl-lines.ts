/**
 * B-2 LEFT — JE-line reconcilable rows (ORDERS-2026-10-01 §6 / QBO REGISTER SPEC §6).
 *
 * QBO reconcile works on GL lines against the bank account, not only bank-feed rows.
 * Payroll / manual Journal entries that hit banking.bank_accounts.ledger_account_id must
 * appear in the workspace and clear via the canonical register_cleared writer
 * (account-register.service.toggleAccountRegisterCleared — one-writer law).
 *
 * Debit on the bank GL = deposit (money in); credit = payment (money out) — same sign as
 * bank-tieout.service GL_ONLY_SQL.
 *
 * Exclude postings already represented by a live bank_transactions row in the same period
 * (matched_journal_entry_id or bank_categorization source) so the grid does not double-count.
 */
import { toggleAccountRegisterCleared, AccountRegisterToggleError } from "../accounting/account-register.service.js";

type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ReconcilableGlLine = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  amount_cents: number;
  /** true = deposit (debit to bank); false = payment (credit to bank). */
  is_credit: boolean;
  memo: string | null;
  description: string | null;
  type_label: string;
  source_transaction_type: string | null;
  register_cleared: boolean;
  ref: string | null;
  payee: string | null;
  split_account: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  bill: "Bill",
  customer_payment: "Invoice Payment",
  bill_payment: "Bill Payment",
  cash_advance: "Cash Advance",
  // BANK-F91057 — live key aliases (must match RECON_TXN_TYPE_FILTERS chip labels).
  driver_cash_advance: "Cash Advance",
  driver_advance: "Driver Advance",
  settlement: "Settlement",
  driver_settlement: "Settlement",
  transfer: "Transfer",
  expense: "Expense",
  bank_deposit: "Deposit",
  bank_categorization: "Bank Categorization",
  journal_entry: "Journal",
  manual_je: "Journal",
  // BANK-F91056 — must match RECON_TXN_TYPE_FILTERS labels on ReconciliationWorkspace.
  credit_memo: "Credit Memo",
  fuel_event: "Fuel Event",
  load: "Load",
  escrow_account: "Escrow",
  bank_reconciliation: "Bank Reconciliation",
};

export async function listReconcilableGlLines(
  client: QueryableClient,
  input: {
    operating_company_id: string;
    bank_account_id: string;
    period_start: string;
    period_end: string;
  }
): Promise<ReconcilableGlLine[]> {
  const ledgerRes = await client.query<{ ledger_account_id: string | null }>(
    `SELECT ledger_account_id::text AS ledger_account_id
       FROM banking.bank_accounts
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1`,
    [input.bank_account_id, input.operating_company_id]
  );
  const ledgerAccountId = ledgerRes.rows[0]?.ledger_account_id ?? null;
  if (!ledgerAccountId) return [];

  const res = await client.query<{
    posting_id: string;
    journal_entry_id: string;
    entry_date: string;
    amount_cents: string | number;
    debit_or_credit: string;
    memo: string | null;
    description: string | null;
    source_transaction_type: string | null;
    register_cleared: boolean;
    ref: string | null;
    payee: string | null;
    split_account: string | null;
  }>(
    `
      SELECT p.id::text AS posting_id,
             je.id::text AS journal_entry_id,
             je.entry_date::text AS entry_date,
             p.amount_cents::bigint AS amount_cents,
             p.debit_or_credit,
             je.memo,
             p.description,
             p.source_transaction_type,
             COALESCE(p.register_cleared, false) AS register_cleared,
             NULLIF(btrim(je.memo), '') AS ref,
             NULLIF(btrim(COALESCE(p.description, je.memo)), '') AS payee,
             sp.split_account
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je
          ON je.id = p.journal_entry_uuid
         AND je.operating_company_id = p.operating_company_id
        LEFT JOIN LATERAL (
          SELECT CASE WHEN count(*) = 0 THEN NULL
                      WHEN count(*) = 1 THEN max(sa.account_name)
                      ELSE '-Split-' END AS split_account
            FROM (SELECT DISTINCT op.account_id
                    FROM accounting.journal_entry_postings op
                   WHERE op.journal_entry_uuid = p.journal_entry_uuid
                     AND op.account_id <> p.account_id) d
            JOIN catalogs.accounts sa
              ON sa.id = d.account_id
             AND sa.operating_company_id = p.operating_company_id
        ) sp ON true
       WHERE p.operating_company_id = $1::uuid
         AND p.account_id = $2::uuid
         AND je.entry_date BETWEEN $3::date AND $4::date
         AND je.status <> 'voided'
         AND COALESCE(je.is_sample_data, false) = false
         -- Already on the bank-feed side of this reconcile → do not double-count.
         AND NOT EXISTS (
           SELECT 1
             FROM banking.bank_transactions bt
            WHERE bt.operating_company_id = p.operating_company_id
              AND bt.bank_account_id = $5::uuid
              AND bt.voided_at IS NULL
              AND bt.transaction_date BETWEEN $3::date AND $4::date
              AND (
                bt.matched_journal_entry_id = je.id
                OR (p.source_transaction_type = 'bank_categorization'
                    AND bt.id::text = p.source_transaction_id)
              )
         )
       ORDER BY je.entry_date DESC, je.created_at DESC, p.line_sequence ASC
    `,
    [
      input.operating_company_id,
      ledgerAccountId,
      input.period_start,
      input.period_end,
      input.bank_account_id,
    ]
  );

  return res.rows.map((row) => {
    const src = row.source_transaction_type;
    const typeLabel =
      (src && TYPE_LABELS[src]) || (src ? src.replace(/_/g, " ") : "Journal");
    return {
      posting_id: row.posting_id,
      journal_entry_id: row.journal_entry_id,
      entry_date: row.entry_date,
      amount_cents: Math.abs(Number(row.amount_cents) || 0),
      is_credit: row.debit_or_credit === "debit",
      memo: row.memo,
      description: row.description,
      type_label: typeLabel,
      source_transaction_type: src,
      register_cleared: Boolean(row.register_cleared),
      ref: row.ref,
      payee: row.payee,
      split_account: row.split_account,
    };
  });
}

/** Shape compatible with computeSummaryFromTransactions / FE clear toggle. */
export function glLinesAsSummaryRows(lines: ReconcilableGlLine[]) {
  return lines.map((line) => ({
    amount_cents: line.amount_cents,
    is_credit: line.is_credit,
    reconciliation_cleared: line.register_cleared,
    matched_load_id: null as string | null,
    matched_bill_id: null as string | null,
    matched_settlement_id: null as string | null,
    matched_expense_id: null as string | null,
    matched_transfer_id: null as string | null,
    matched_journal_entry_id: null as string | null,
  }));
}

/**
 * Fold JE-line clears into an already-computed bank-feed summary WITHOUT re-running the
 * bank-side anyCleared / match-fallback normalizer (a register_cleared JE must not flip
 * matched-but-not-explicitly-cleared bank rows to uncleared).
 */
export function foldGlLinesIntoSummary<T extends {
  beginningBalanceCents: number;
  statementEndingCents: number;
  clearedCreditsCents: number;
  clearedDebitsCents: number;
  depositsInTransitCents: number;
  outstandingChecksCents: number;
  adjustedBankBalanceCents: number;
  adjustedBookBalanceCents: number;
  varianceCents: number;
  bookBalanceCents: number;
  matchedCreditsCents: number;
  matchedDebitsCents: number;
}>(
  bankSummary: T,
  glLines: ReconcilableGlLine[],
  opts?: { serviceChargeCents?: number; interestEarnedCents?: number }
): T {
  let glCredits = 0;
  let glDebits = 0;
  let glInTransit = 0;
  let glOutstanding = 0;
  for (const line of glLines) {
    const abs = Math.abs(Number(line.amount_cents) || 0);
    if (line.is_credit) {
      if (line.register_cleared) glCredits += abs;
      else glInTransit += abs;
    } else if (line.register_cleared) {
      glDebits += abs;
    } else {
      glOutstanding += abs;
    }
  }
  const serviceChargeCents = Math.max(0, Math.trunc(Number(opts?.serviceChargeCents ?? 0)));
  const interestEarnedCents = Math.max(0, Math.trunc(Number(opts?.interestEarnedCents ?? 0)));
  const clearedCreditsCents = bankSummary.clearedCreditsCents + glCredits;
  const clearedDebitsCents = bankSummary.clearedDebitsCents + glDebits;
  const depositsInTransitCents = bankSummary.depositsInTransitCents + glInTransit;
  const outstandingChecksCents = bankSummary.outstandingChecksCents + glOutstanding;
  const adjustedBankBalanceCents =
    bankSummary.statementEndingCents + depositsInTransitCents - outstandingChecksCents;
  const adjustedBookBalanceCents =
    bankSummary.beginningBalanceCents +
    clearedCreditsCents -
    clearedDebitsCents -
    serviceChargeCents +
    interestEarnedCents;
  const varianceCents = adjustedBankBalanceCents - adjustedBookBalanceCents;
  return {
    ...bankSummary,
    clearedCreditsCents,
    clearedDebitsCents,
    depositsInTransitCents,
    outstandingChecksCents,
    adjustedBankBalanceCents,
    adjustedBookBalanceCents,
    varianceCents,
    bookBalanceCents: adjustedBookBalanceCents,
    matchedCreditsCents: clearedCreditsCents,
    matchedDebitsCents: clearedDebitsCents,
  };
}

export async function clearReconcilableGlLine(
  client: QueryableClient,
  input: {
    operating_company_id: string;
    posting_id: string;
    cleared: boolean;
    actor_user_id: string;
  }
): Promise<{ posting_id: string; register_cleared: boolean }> {
  try {
    const result = await toggleAccountRegisterCleared(client, {
      operating_company_id: input.operating_company_id,
      posting_id: input.posting_id,
      cleared: input.cleared,
      actor_user_id: input.actor_user_id,
    });
    return { posting_id: result.posting_id, register_cleared: result.register_cleared };
  } catch (err) {
    if (err instanceof AccountRegisterToggleError) throw err;
    throw err;
  }
}

export { AccountRegisterToggleError };
