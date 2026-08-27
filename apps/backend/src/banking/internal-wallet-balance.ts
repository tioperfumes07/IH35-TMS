// INTERNAL (non-Plaid) WALLET BALANCE — root-cause fix for the Relay Fuel Wallet tile showing $0.00.

//

// banking.bank_accounts.current_balance_cents / available_balance_cents are ONLY ever written by the

// Plaid webhook/exchange path (integrations/plaid/plaid.service.ts, "UPDATE banking.bank_accounts SET

// current_balance_cents = ..."). An account with plaid_item_id IS NULL — the Relay Fuel Wallet is the

// only one today (verified prod, 2026-07-16) — is seeded at 0 (202607470000_relay_wallet_banking_

// registration.sql) and NEVER updated again: relay-wallet-bank-feed.service.ts explicitly mirrors Relay

// deposits/fuel-draws onto banking.bank_transactions for VISIBILITY + LINKAGE ONLY ("No GL", "Does NOT

// post journal entries") — it was never wired to also update the account's stored balance columns. So

// every reader of those two columns (BankingHome tile, BankAccountDetail "Current/Available balance",

// and the register's running-balance anchor in BankingTransactionsDesignView.tsx) shows $0.00 / a wrong

// anchor forever, no matter how many real transactions the wallet has (1,580 on prod today).

//

// FIX (QBO parity): a bank register in QuickBooks has no independently-stored balance column at all —

// the balance is ALWAYS the sum of the ledger. For any bank account with NO Plaid connection, derive its

// balance the same way, every time it's read, from its own banking.bank_transactions rows (credits −

// debits) instead of trusting a column nothing keeps in sync. Plaid-linked accounts are untouched — their

// stored columns remain the authoritative, externally-synced source of truth.

//

// Scope: this only ever changes accounts where plaid_item_id IS NULL. On prod today that is exactly one

// row (Relay Fuel Wallet); every other bank_accounts row is Plaid-linked and passes through unchanged.



type QueryClient = {

  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;

};



export type BankAccountBalanceFields = {

  id: string;

  plaid_item_id: string | null;

  current_balance_cents?: unknown;

  available_balance_cents?: unknown;

  [key: string]: unknown;

};



/** amount_cents on banking.bank_transactions is stored as a POSITIVE magnitude for the Relay wallet feed

 *  (relay-wallet-bank-feed.service.ts) — is_credit is the sole sign source, NOT the Plaid negative-is-

 *  credit convention used elsewhere. Money in (is_credit) adds; money out subtracts. */

async function sumLedgerBalanceCents(

  client: QueryClient,

  operatingCompanyId: string,

  bankAccountIds: string[]

): Promise<Map<string, number>> {

  const map = new Map<string, number>();

  if (bankAccountIds.length === 0) return map;

  const res = await client.query<{ bank_account_id: string; balance_cents: string }>(

    `

      SELECT

        bank_account_id::text AS bank_account_id,

        COALESCE(SUM(CASE WHEN is_credit THEN amount_cents ELSE -amount_cents END), 0)::text AS balance_cents

      FROM banking.bank_transactions

      WHERE operating_company_id = $1::uuid

        AND bank_account_id = ANY($2::uuid[])

        AND voided_at IS NULL

      GROUP BY bank_account_id

    `,

    [operatingCompanyId, bankAccountIds]

  );

  for (const row of res.rows) map.set(row.bank_account_id, Number(row.balance_cents));

  return map;

}



/**

 * Single authoritative depository cash total for KPI + cash-flow opening + accounts/all agreement.

 *

 *   Plaid-linked depository: SUM(current_balance_cents) — external sync is source of truth

 *     (never re-sum bank_transactions for this population — that caused the -$4.79M phantom).

 *   Non-Plaid internal wallets: is_credit-keyed ledger sum (stored columns stay frozen at 0).

 *

 * hideFilterOnBankAccounts / hideFilterOnBaAlias must be the fragments from

 * bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts") and (... ,"ba") respectively

 * (empty string when hide is OFF).

 */

export async function sumAuthoritativeDepositoryCashCents(

  client: QueryClient,

  operatingCompanyId: string,

  opts: { hideFilterOnBankAccounts: string; hideFilterOnBaAlias: string }

): Promise<number> {

  const plaidRes = await client

    .query<{ total_cash: string | number | null }>(

      `

      SELECT COALESCE(SUM(current_balance_cents), 0)::bigint AS total_cash

      FROM banking.bank_accounts

      WHERE operating_company_id = $1::uuid

        AND account_class = 'depository'

        AND is_active = true

        -- BANK-F14: a row can carry BOTH flags disagreeing. is_active alone counted three of
        -- Transportation's Wells Fargo accounts as Trucking cash ($2,003.67 of $2,009.05 reported).
        -- The CHECK constraint added in 202610280000 makes that state impossible; this second
        -- condition is defence in depth so the cash total is right even if the constraint is ever
        -- dropped or a row arrives from a path that bypasses it.
        AND deactivated_at IS NULL

        AND plaid_item_id IS NOT NULL

      ${opts.hideFilterOnBankAccounts}

      `,

      [operatingCompanyId]

    );
    // BANK-KPI-FAKE-ZERO-CATCH-CLUSTER: this used to catch-and-mask a query failure as a fake-zero
    // total_cash row -- a real query failure (RLS glitch, connection blip, whatever) silently became
    // "$0 depository cash" instead of failing loud, and this exact total feeds the /banking KPI strip,
    // /cash-flow opening cash, AND /accounts/all -- one masked failure here corrupts three surfaces at
    // once with a number that reads as a real, alarming balance. Let it throw; the caller chain
    // (banking.routes.ts, cash-flow.service.ts, reports/cash-flow/route-fix.ts) already has honest
    // error handling above it (the KPI route's kpiQuery.isError -> ListErrorBanner already exists on
    // the frontend and simply never fired because this never threw).



  const internalRes = await client

    .query<{ internal_total: string | number | null }>(

      `

      SELECT COALESCE(SUM(CASE WHEN bt.is_credit THEN bt.amount_cents ELSE -bt.amount_cents END), 0)::bigint

        AS internal_total

      FROM banking.bank_transactions bt

      JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id

      WHERE bt.operating_company_id = $1::uuid

        AND ba.operating_company_id = $1::uuid

        AND ba.account_class = 'depository'

        AND ba.is_active = true

        -- BANK-F14: see above — both liveness flags, not one.
        AND ba.deactivated_at IS NULL

        AND ba.plaid_item_id IS NULL

        AND bt.voided_at IS NULL

      ${opts.hideFilterOnBaAlias}

      `,

      [operatingCompanyId]

    );
    // BANK-KPI-FAKE-ZERO-CATCH-CLUSTER: same fix as the plaidRes query above -- fail loud instead of
    // silently contributing $0 for the non-Plaid (internal wallet) leg of the same authoritative total.



  return Number(plaidRes.rows[0]?.total_cash ?? 0) + Number(internalRes.rows[0]?.internal_total ?? 0);

}



/** List-endpoint variant — one batched query for every non-Plaid account in the result set, applied

 *  as a pass-through override (Plaid-linked rows are returned unchanged, by identity). */

export async function withInternalWalletBalances<T extends BankAccountBalanceFields>(

  client: QueryClient,

  operatingCompanyId: string,

  accounts: T[]

): Promise<T[]> {

  const internalIds = accounts.filter((a) => !a.plaid_item_id).map((a) => a.id);

  if (internalIds.length === 0) return accounts;

  const balances = await sumLedgerBalanceCents(client, operatingCompanyId, internalIds);

  return accounts.map((a) => {

    if (a.plaid_item_id) return a;

    const derivedCents = String(balances.get(a.id) ?? 0);

    return { ...a, current_balance_cents: derivedCents, available_balance_cents: derivedCents };

  });

}



/** Single-account variant for detail routes (e.g. GET /banking/plaid/accounts/:id). */

export async function deriveInternalWalletBalanceCents(

  client: QueryClient,

  operatingCompanyId: string,

  bankAccountId: string

): Promise<number> {

  const map = await sumLedgerBalanceCents(client, operatingCompanyId, [bankAccountId]);

  return map.get(bankAccountId) ?? 0;

}

export type BankingTileBalanceFields = {

  id: string;

  tile_kind: string;

  current_balance: unknown;

  plaid_item_id?: string | null;

};

/** Account-tiles variant — views.banking_account_tiles.current_balance is dollars, but non-Plaid

 *  internal wallets (Relay Fuel Wallet) read $0 from bank_account_balances while the KPI aggregate

 *  includes their ledger-derived cents. Override only real tiles with plaid_item_id IS NULL. */

export async function withInternalWalletTileBalances<T extends BankingTileBalanceFields>(

  client: QueryClient,

  operatingCompanyId: string,

  tiles: T[]

): Promise<T[]> {

  const internalIds = tiles

    .filter((t) => t.tile_kind === "real" && (t.plaid_item_id == null || t.plaid_item_id === ""))

    .map((t) => t.id);

  if (internalIds.length === 0) return tiles;

  const balances = await sumLedgerBalanceCents(client, operatingCompanyId, internalIds);

  return tiles.map((t) => {

    if (t.tile_kind !== "real" || (t.plaid_item_id != null && t.plaid_item_id !== "")) return t;

    const cents = balances.get(t.id) ?? 0;

    return { ...t, current_balance: cents / 100 };

  });

}
