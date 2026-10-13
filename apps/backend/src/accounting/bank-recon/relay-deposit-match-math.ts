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
