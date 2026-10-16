/** ROUND 443.29-B / 443.54 — Relay wallet funding: bank/card outflow = wallet + 3.25% fee (integer half-up).
 *
 * Live storage: integrations.relay_deposits.total_amount_cents is the CHARGED amount
 * (wallet + fee), the same figure the poster stores as raw_payload.total. Never treat it as wallet
 * and add the fee again — that double-counts and no Bank of America line will match.
 */
export const RELAY_DEPOSIT_FEE_BPS = 325;

export function relayDepositFeeCents(walletCents: number): number {
  const w = Math.trunc(walletCents);
  if (w <= 0) return 0;
  return Math.trunc((w * RELAY_DEPOSIT_FEE_BPS + 5000) / 10000);
}

export function relayDepositChargedCents(walletCents: number): number {
  const w = Math.trunc(walletCents);
  return w + relayDepositFeeCents(w);
}

/** SQL on alias `rd` — charged cents for match scoring (= bank line amount). */
export const RELAY_DEPOSIT_CHARGED_AMOUNT_SQL = `rd.total_amount_cents`;

/** SQL on alias `rd` — wallet leg from Relay's raw amount (dollars → cents). */
export const RELAY_DEPOSIT_WALLET_AMOUNT_SQL = `ROUND((NULLIF(regexp_replace(COALESCE(rd.raw_payload->>'amount', ''), '[^0-9.\\-]', '', 'g'), '')::numeric) * 100)::bigint`;

/** SQL on alias `rd` — fee leg from Relay's raw fee (dollars → cents). */
export const RELAY_DEPOSIT_FEE_AMOUNT_SQL = `ROUND((NULLIF(regexp_replace(COALESCE(rd.raw_payload->>'fee', ''), '[^0-9.\\-]', '', 'g'), '')::numeric) * 100)::bigint`;

/**
 * ROUND 443.54 — a matchable deposit is settled + not void, and either owner-classified company
 * OR already posted through the deposit JE writer (live 0680 rows stayed classification=unclassified).
 */
export const RELAY_DEPOSIT_MATCHABLE_SQL = `(
  rd.classification = 'company'
  OR EXISTS (
    SELECT 1 FROM accounting.journal_entry_postings p
     WHERE p.operating_company_id = rd.operating_company_id
       AND p.source_transaction_type = 'relay_deposit'
       AND p.source_transaction_id = rd.id::text
       AND p.reversed_by_line_id IS NULL
       AND p.reversal_of_line_id IS NULL
  )
)`;

/**
 * LEAD 443.170 — on alias `rd`, with $8 = the register's ledger account: the deposit's posted JE credits THIS ledger
 * (the funding leg). Posting-based so another account's money is never offered here.
 */
export const RELAY_DEPOSIT_CREDITS_LEDGER_SQL = `EXISTS (
    SELECT 1 FROM accounting.journal_entry_postings fjp
     WHERE fjp.operating_company_id = rd.operating_company_id
       AND fjp.journal_entry_uuid = rd.posted_journal_entry_id
       AND fjp.account_id = $8::uuid
       AND fjp.debit_or_credit = 'credit'
       AND fjp.reversed_by_line_id IS NULL
       AND fjp.reversal_of_line_id IS NULL
  )`;

/**
 * LEAD 443.170 — on alias `rd`, with $7 = this bank account: no live bank line ON THIS ACCOUNT already links the deposit
 * (the other side's link never blocks this one).
 */
export const RELAY_DEPOSIT_FREE_ON_THIS_ACCOUNT_SQL = `(
    NOT EXISTS (SELECT 1 FROM banking.bank_transactions cbt
                 WHERE cbt.matched_relay_deposit_id = rd.id AND cbt.voided_at IS NULL AND cbt.bank_account_id = $7::uuid)
    AND (rd.matched_bank_transaction_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM banking.bank_transactions pbt
                         WHERE pbt.id = rd.matched_bank_transaction_id AND pbt.bank_account_id = $7::uuid))
  )`;
