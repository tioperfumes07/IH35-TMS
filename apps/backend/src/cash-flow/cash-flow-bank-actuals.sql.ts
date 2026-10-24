/**
 * LEAD 443.282 — Cash Flow ACTUALS come from the operating bank, not from A/R / A/P application rows.
 *
 * ROOT CAUSE (measured on prod 10-23-2026): getActualVsProjected summed accounting.payments (customer
 * payments APPLIED to invoices) and accounting.bill_payments. USMCA has 0 applied customer payments, so
 * "Actual income" read $0.00 on every day while the operating account received $216,532.56 in October
 * (out $239,059.03) — and the Cash Flow Home weekly run-rate / ACTUAL bars (which read these lines) were
 * wrong with it. The Actual vs Projected board itself labels the series "Actual income (bank)" /
 * "Actual expenses (bank)": actual cash is what cleared the bank (QuickBooks / Float convention).
 *
 * ACCOUNT SET = the same authoritative operating set as opening cash (sumAuthoritativeDepositoryCashCents):
 * depository, active, not deactivated, Plaid-linked, hide flag respected. Credit cards, factoring/escrow
 * virtual accounts and the internal Relay wallet are excluded (funding the wallet is an outflow of the
 * operating account, counted once there).
 *
 * EXCLUDED LINES: voided, merged duplicates, pending, sample, and internal transfers whose other side is
 * another account in the same operating set (moving money between our own operating accounts is not
 * income or expense).
 *
 * DIRECTION: is_credit decides money in vs out and ABS(amount_cents) the size — never the sign of
 * amount_cents, which runs opposite is_credit for part of this table (Plaid convention on older imports;
 * verify-bank-transactions-direction-uses-is-credit). On USMCA's October lines both agree: 29 credits
 * $216,532.56 in, 209 debits $239,059.03 out (incl. pending).
 */
export function operatingBankAccountSetSql(baAlias: string, hideFilterOnBaAlias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(baAlias)) throw new Error(`invalid SQL alias: ${baAlias}`);
  const a = baAlias;
  return `(${a}.account_class = 'depository'
        AND ${a}.is_active = true
        AND ${a}.deactivated_at IS NULL
        AND ${a}.plaid_item_id IS NOT NULL
        ${hideFilterOnBaAlias})`;
}

/** Per-day actual income / expense cents from the operating bank. Params: $1 company, $2 from, $3 to.
 *  hideFilterOnBaAlias must be built for alias "ba" (bankAccountHiddenFilterSql(hideOn, "ba")). */
export function operatingBankActualsByDaySql(hideFilterOnBaAlias: string): string {
  const otherSide = (alias: string) => operatingBankAccountSetSql(alias, hideFilterOnBaAlias.replace(/\bba\./g, `${alias}.`));
  return `
    SELECT
      bt.transaction_date::text AS actual_date,
      SUM(CASE WHEN bt.is_credit THEN ABS(bt.amount_cents) ELSE 0 END)::bigint AS actual_income_cents,
      SUM(CASE WHEN bt.is_credit THEN 0 ELSE ABS(bt.amount_cents) END)::bigint AS actual_expense_cents
    FROM banking.bank_transactions bt
    JOIN banking.bank_accounts ba
      ON ba.id = bt.bank_account_id AND ba.operating_company_id = bt.operating_company_id
    WHERE bt.operating_company_id = $1::uuid
      AND bt.transaction_date BETWEEN $2::date AND $3::date
      AND ${operatingBankAccountSetSql("ba", hideFilterOnBaAlias)}
      AND bt.voided_at IS NULL
      AND bt.merged_into_bank_transaction_id IS NULL
      AND COALESCE(bt.pending, false) = false
      AND COALESCE(bt.is_sample_data, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM banking.bank_accounts xa
        WHERE xa.id = bt.destination_bank_account_id
          AND xa.operating_company_id = bt.operating_company_id
          AND ${otherSide("xa")}
      )
      AND NOT EXISTS (
        SELECT 1 FROM banking.bank_transactions pt
        JOIN banking.bank_accounts pa ON pa.id = pt.bank_account_id AND pa.operating_company_id = pt.operating_company_id
        WHERE pt.id = bt.paired_transaction_id
          AND pt.bank_account_id <> bt.bank_account_id
          AND pt.voided_at IS NULL
          AND ${otherSide("pa")}
      )
    GROUP BY bt.transaction_date
    ORDER BY bt.transaction_date`;
}

/** Count of operating accounts with a live feed — 0 means actuals cannot be seen (honest "unavailable"). */
export function operatingBankFeedCountSql(hideFilterOnBaAlias: string): string {
  return `SELECT COUNT(*)::int AS n FROM banking.bank_accounts ba
    WHERE ba.operating_company_id = $1::uuid AND ${operatingBankAccountSetSql("ba", hideFilterOnBaAlias)}`;
}
