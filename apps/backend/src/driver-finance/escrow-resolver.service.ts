// SETTLEMENT PAY-RUN — driver escrow resolver + $2,000-cap contribution math (Phase 2b, I3 LOCKED).
//
// I3 (owner-locked): driver escrow is a LIABILITY held-in-trust. The pay-run CONTRIBUTES to it until the
// driver's escrow balance reaches $2,000 (cap → contribution 0). It NEVER releases escrow in the pay-run.
//
// OWNER-LOCK on the resolver (reuse-and-extend, NEVER build a parallel): the per-driver escrow LIABILITY
// sub-account is resolved BY THE DRIVER-KEYED BRIDGE (accounting.escrow_accounts, holder_type='driver',
// migration 0234) — the SAME deterministic driver→coa_account_id link written by
// accounting/driver-subaccount-provision.service.ts (upsertDriverEscrowAccountLink) and read by
// accounting/settlement-posting/settlement-bill-payment-posting.service.ts. We DO NOT add a new
// account_role_bindings role_key, DO NOT use chart_of_accounts_roles name-style lookups, and DO NOT
// name-LIKE '%escrow%' anywhere (name resolution can shadow the wrong per-driver account — a GL-correctness
// defect). The resolver then ASSERTS, fail-loud:
//   (a) the resolved catalogs.accounts row is a Liability (account_type = 'Liability', the real enum value
//       from 0010_catalogs_init.sql's account_type CHECK), and
//   (b) the account's QBO id is NOT '1150040084' — the Faro factoring-reserve ASSET ("Faro Escrow Account",
//       QBO-1150040084) — so a mis-provisioned bridge can never credit the factor's reserve as if it were
//       the driver's held-in-trust liability.
// Any unbound / wrong-type / Faro resolution throws a typed EscrowResolverError (never guesses, never falls
// back to a shared default).

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

/** I3 LOCKED: escrow cap = $2,000 (200,000 cents). At/over the cap the pay-run contributes 0. */
export const ESCROW_CAP_CENTS = 200_000;

/**
 * Faro factoring-RESERVE asset ("Faro Escrow Account", QBO-1150040084). This is a factor reserve (an
 * ASSET, bound to the factor_reserve_held role), NOT the driver's held-in-trust liability. The driver
 * escrow resolver must NEVER resolve to it — asserted below.
 */
export const FARO_FACTORING_RESERVE_QBO_ID = "1150040084";

/**
 * Default standard escrow contribution per settlement, in cents. The owner's per-driver / per-entity policy
 * amount is the real source; this is the fallback the caller uses when no policy row is configured. Kept as
 * a named constant so the "contribute until $2,000" cadence lives in one place. (TODO: wire the owner's
 * configured per-driver contribution once a policy column lands — see settlement-payrun-close.service.ts.)
 */
export const DEFAULT_ESCROW_PER_SETTLEMENT_CONTRIBUTION_CENTS = 25_000;

export type EscrowResolverErrorCode =
  | "DRIVER_ESCROW_ACCOUNT_UNBOUND"
  | "DRIVER_ESCROW_ACCOUNT_WRONG_TYPE"
  | "DRIVER_ESCROW_ACCOUNT_IS_FARO";

export class EscrowResolverError extends Error {
  code: EscrowResolverErrorCode;
  details?: Record<string, unknown>;
  constructor(code: EscrowResolverErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "EscrowResolverError";
    this.code = code;
    this.details = details;
  }
}

export type ResolvedEscrowLiabilityAccount = {
  accountId: string;
  qboAccountId: string | null;
  accountType: string;
  accountName: string;
};

/**
 * Resolve the driver's OWN "Damage Claim Escrow" LIABILITY sub-account by the driver-keyed bridge
 * (accounting.escrow_accounts, holder_type='driver'), then fail-loud assert it is a Liability and is NOT the
 * Faro factoring-reserve asset. Entity-scoped: the caller MUST have set app.operating_company_id on the tx
 * (FORCED RLS returns 0 rows otherwise). Delegates to the SAME per-driver sub-account link the provisioner
 * writes — no new resolution path, no name-matching.
 *
 * Throws EscrowResolverError:
 *   - DRIVER_ESCROW_ACCOUNT_UNBOUND  — no active per-driver escrow bridge / postable sub-account.
 *   - DRIVER_ESCROW_ACCOUNT_WRONG_TYPE — the bound account is not a Liability.
 *   - DRIVER_ESCROW_ACCOUNT_IS_FARO   — the bound account is the Faro factoring-reserve asset (QBO-1150040084).
 */
export async function resolveDriverEscrowLiabilityAccount(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string
): Promise<ResolvedEscrowLiabilityAccount> {
  // The driver-keyed bridge → the per-driver escrow LIABILITY sub-account (a SUB-account, never the shared
  // top-level default: parent_account_id IS NOT NULL). Read exactly like the settlement poster does, so the
  // pay-run and the poster resolve the identical account.
  const res = await client.query<{
    account_id: string;
    account_type: string;
    account_name: string;
    qbo_account_id: string | null;
  }>(
    `
      SELECT a.id::text          AS account_id,
             a.account_type      AS account_type,
             a.account_name      AS account_name,
             a.qbo_account_id    AS qbo_account_id
      FROM accounting.escrow_accounts ea
      JOIN catalogs.accounts a ON a.id = ea.coa_account_id
      WHERE ea.operating_company_id = $1::uuid
        AND ea.holder_id = $2::uuid
        AND ea.holder_type = 'driver'
        AND a.parent_account_id IS NOT NULL
        AND a.deactivated_at IS NULL
        AND a.is_postable = true
        AND a.operating_company_id = $1::uuid
      LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );
  const row = res.rows[0];
  if (!row?.account_id) {
    throw new EscrowResolverError(
      "DRIVER_ESCROW_ACCOUNT_UNBOUND",
      `Driver ${driverId} has no provisioned per-driver Damage-Claim escrow LIABILITY sub-account bound in accounting.escrow_accounts`,
      { operating_company_id: operatingCompanyId, driver_id: driverId }
    );
  }

  // (a) LIABILITY or FAIL LOUD — 'Liability' is the real account_type enum value (catalogs.accounts CHECK).
  if (row.account_type !== "Liability") {
    throw new EscrowResolverError(
      "DRIVER_ESCROW_ACCOUNT_WRONG_TYPE",
      `Driver ${driverId} escrow account ${row.account_id} is account_type='${row.account_type}', expected 'Liability' (escrow is held-in-trust)`,
      { account_id: row.account_id, account_type: row.account_type }
    );
  }

  // (b) NOT the Faro factoring-reserve ASSET (QBO-1150040084) or FAIL LOUD.
  if (row.qbo_account_id != null && String(row.qbo_account_id) === FARO_FACTORING_RESERVE_QBO_ID) {
    throw new EscrowResolverError(
      "DRIVER_ESCROW_ACCOUNT_IS_FARO",
      `Driver ${driverId} escrow bridge resolves to the Faro factoring-reserve asset (QBO-${FARO_FACTORING_RESERVE_QBO_ID}) — never contribute driver escrow there`,
      { account_id: row.account_id, qbo_account_id: row.qbo_account_id }
    );
  }

  return {
    accountId: row.account_id,
    qboAccountId: row.qbo_account_id ?? null,
    accountType: row.account_type,
    accountName: row.account_name,
  };
}

/**
 * The driver's CURRENT escrow LIABILITY balance in cents (authoritative source): the per-driver running
 * balance in driver_finance.escrow_balances.current_balance_cents (the "running escrow balance per driver
 * across all settlements" table). Falls back to the most-recent driver_finance.escrow_ledger
 * running_balance_cents when no balances row exists yet. Returns 0 when the driver has no escrow history.
 * Entity-scoped (caller sets app.operating_company_id). Read-only.
 */
export async function readDriverEscrowBalanceCents(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string
): Promise<number> {
  const bal = await client.query<{ current_balance_cents: number | string | null }>(
    `
      SELECT current_balance_cents
      FROM driver_finance.escrow_balances
      WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid
      LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );
  if (bal.rows[0] != null) return Math.max(0, Math.round(Number(bal.rows[0].current_balance_cents ?? 0)));

  // No summary row yet — derive from the latest ledger entry's running balance (the detailed history).
  const led = await client.query<{ running_balance_cents: number | string | null }>(
    `
      SELECT running_balance_cents
      FROM driver_finance.escrow_ledger
      WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );
  return Math.max(0, Math.round(Number(led.rows[0]?.running_balance_cents ?? 0)));
}

/**
 * I3 capped escrow contribution (PURE): contribute the standard per-settlement amount, but only up to the
 * $2,000 cap — contribution = min(standard, max(0, 200000 − currentBalance)). At/over the cap → 0. Never
 * negative. Never a release. This is THE function that performs the capped escrow contribution.
 */
export function computeCappedEscrowContributionCents(args: {
  currentBalanceCents: number;
  standardPerSettlementContributionCents: number;
}): number {
  const current = Math.max(0, Math.round(Number(args.currentBalanceCents) || 0));
  const standard = Math.max(0, Math.round(Number(args.standardPerSettlementContributionCents) || 0));
  const headroom = Math.max(0, ESCROW_CAP_CENTS - current);
  return Math.min(standard, headroom);
}
