/**
 * CONN-3 — the Relay wallet RECONCILING CONTROL.
 *
 * WHY THE WALLET EXISTS AT ALL
 * CONN-3 models the prepaid Relay wallet as an ASSET so its balance can be reconciled against Relay's
 * own reported balance. That is the entire justification for carrying it as an account rather than
 * expensing fuel straight off the bank feed. Without a control that actually compares the two, the
 * wallet is bookkeeping with no verification attached — it looks rigorous and proves nothing.
 *
 * WHAT THIS COMPUTES (read-only; posts nothing, writes nothing)
 *   ledger_balance_cents  = Σ postings on the entity's relay_fuel_wallet GL account (DR − CR)
 *   funded_cents          = Σ settled, company-classified deposits (stage 1 in)
 *   drawn_cents           = Σ fuel transactions drawn on the wallet (stage 2 out)
 *   expected_cents        = funded − drawn
 *   divergence_cents      = ledger_balance − expected
 *
 * A non-zero divergence is the signal. It does NOT auto-correct anything: this is a control, and a
 * control that silently fixes its own exceptions cannot be trusted to report them. RECON-01's rule
 * applies — flag every divergence, no dollar threshold, read-only, never auto-fix.
 *
 * HONEST ABOUT WHAT IT CANNOT SEE
 * `unclassified` deposits are excluded from `funded_cents` on purpose: the funding card is not yet
 * identified as the company's, and it may be an owner loan or a capital contribution. They are
 * reported separately as `unclassified_cents` so the number is visible rather than silently folded
 * into expectations — a control that quietly absorbs what it does not understand is how a
 * reconciliation starts lying.
 */

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type RelayWalletBalanceControl = {
  operating_company_id: string;
  wallet_account_id: string | null;
  wallet_account_number: string | null;
  ledger_balance_cents: number;
  funded_cents: number;
  drawn_cents: number;
  expected_cents: number;
  divergence_cents: number;
  unclassified_cents: number;
  in_balance: boolean;
  /** Present when the control cannot be computed at all, rather than reporting a misleading zero. */
  unavailable_reason?: "no_wallet_account";
};

export async function computeRelayWalletBalanceControl(
  client: Queryable,
  operatingCompanyId: string
): Promise<RelayWalletBalanceControl> {
  const acctRes = await client.query<{ id: string; account_number: string }>(
    `
      SELECT id::text AS id, account_number
      FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid
        AND system_purpose = 'relay_fuel_wallet'
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const acct = acctRes.rows[0] ?? null;
  if (!acct) {
    // No wallet account for this entity — report that, rather than returning zeroes that would read
    // as "perfectly reconciled".
    return {
      operating_company_id: operatingCompanyId,
      wallet_account_id: null,
      wallet_account_number: null,
      ledger_balance_cents: 0,
      funded_cents: 0,
      drawn_cents: 0,
      expected_cents: 0,
      divergence_cents: 0,
      unclassified_cents: 0,
      in_balance: false,
      unavailable_reason: "no_wallet_account",
    };
  }

  const ledgerRes = await client.query<{ balance_cents: string }>(
    `
      SELECT COALESCE(
               SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END),
             0)::text AS balance_cents
      FROM accounting.journal_entry_postings p
      WHERE p.account_id = $1::uuid
        AND p.operating_company_id = $2::uuid
        AND p.reversed_by_line_id IS NULL
    `,
    [acct.id, operatingCompanyId]
  );

  const depRes = await client.query<{ funded_cents: string; unclassified_cents: string }>(
    `
      SELECT
        COALESCE(SUM(total_amount_cents) FILTER (WHERE classification = 'company'), 0)::text AS funded_cents,
        COALESCE(SUM(total_amount_cents) FILTER (WHERE classification = 'unclassified'), 0)::text AS unclassified_cents
      FROM integrations.relay_deposits
      WHERE operating_company_id = $1::uuid
        AND status = 'settled'
        AND is_active
        AND voided_at IS NULL
    `,
    [operatingCompanyId]
  );

  // ACCT-F5609 — this read a phantom `total_amount_cents` column that never existed on
  // fuel.fuel_transactions (confirmed live: absent). The real column is `total_cost`, numeric
  // DOLLARS, not cents (same units trap fixed in obligation-reconcile.routes.ts's settlement
  // query, ACCT-F5607, and already documented in transaction-register.routes.ts's own header
  // comment). No try/catch anywhere in this function or its one caller (relay-health.routes.ts),
  // so the 42703 has been a genuine unhandled 500 on every call to
  // GET /api/integrations/relay/wallet-balance-control -- not a silent swallow, but the endpoint
  // has zero current callers (no frontend reference, no cron), so `expected = funded - drawn`
  // has never actually been computed for anyone to see either way.
  const drawRes = await client.query<{ drawn_cents: string }>(
    `
      SELECT COALESCE(SUM(ABS(ROUND(total_cost * 100))), 0)::text AS drawn_cents
      FROM fuel.fuel_transactions
      WHERE operating_company_id = $1::uuid
    `,
    [operatingCompanyId]
  );

  const ledger = Number(ledgerRes.rows[0]?.balance_cents ?? 0);
  const funded = Number(depRes.rows[0]?.funded_cents ?? 0);
  const unclassified = Number(depRes.rows[0]?.unclassified_cents ?? 0);
  const drawn = Number(drawRes.rows[0]?.drawn_cents ?? 0);
  const expected = funded - drawn;

  return {
    operating_company_id: operatingCompanyId,
    wallet_account_id: acct.id,
    wallet_account_number: acct.account_number,
    ledger_balance_cents: ledger,
    funded_cents: funded,
    drawn_cents: drawn,
    expected_cents: expected,
    divergence_cents: ledger - expected,
    unclassified_cents: unclassified,
    // RECON-01: every divergence is flagged, with NO dollar threshold. Materiality is a reporting
    // judgement, not a reconciliation one — a control that ignores small differences cannot prove the
    // large ones are the only ones.
    in_balance: ledger - expected === 0,
  };
}
