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

/**
 * OWNER-LOCKED escrow cap = **$2,500 (250,000 cents)**. At/over the cap the pay-run contributes 0.
 *
 * Owner ruling 2026-07-26 (decision C2b, re-confirmed in chat: "IT IS 2500 NOW") RAISES this from the
 * earlier I3-locked $2,000. The old value was a live defect: drivers stopped contributing $500 of
 * escrow early, leaving the buffer short of the owner's intent — and escrow must keep GROWING because
 * a fine can arrive 30–45 days AFTER a driver leaves and escrow must still cover it.
 *
 * Raising the cap only increases headroom; it never claws back or re-charges an existing balance
 * (contribution = min(standard, max(0, CAP − currentBalance))), so drivers at the old $2,000 simply
 * resume contributing until $2,500.
 */
export const ESCROW_CAP_CENTS = 250_000;

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
 * The driver's CURRENT escrow LIABILITY balance in cents — authoritative source is the GL
 * (accounting.escrow_accounts.balance_cents), NOT driver_finance.escrow_balances/escrow_ledger.
 *
 * ACCT-ESCROW-BALANCES-STALE-VS-GO19 (owner ruling 2026-09-05): this function used to read
 * driver_finance.escrow_balances first (falling back to escrow_ledger) — a PARALLEL, unsynced summary
 * table. Live-caught this session: the 2026-09-01 GO-19-02 WORM correction zeroed 3 drivers' GL balance
 * on accounting.escrow_accounts directly (the canonical, trigger-maintained liability), but never
 * touched driver_finance.escrow_balances, which kept reading the STALE pre-correction $250.00/$250.00/
 * $0.01 — actively used by this function's callers (settlement-payrun-close.service.ts's escrow-cap
 * math, settlement-engine.ts, escrow-forfeit.service.ts's over-draw guard) for real settlement-close
 * decisions. Owner ruling: GL is canonical; driver_finance.escrow_balances/escrow_ledger are demoted to
 * a RECONCILED PROJECTION of it (still written by settlement-payrun-close.service.ts on every real
 * contribution, still useful for driver-facing history/timeline UI), never an independent authority for
 * money decisions. accounting.escrow_accounts.balance_cents is kept current by the audited
 * trg_apply_escrow_posting_delta trigger on every real accounting.escrow_postings row (the SAME
 * driver-keyed bridge resolveDriverEscrowLiabilityAccount() above resolves for posting) — reading it
 * here means the pay-run's cap math and the GL can never disagree again. See
 * scripts/verify-escrow-balance-reconciles-gl.mjs for the ongoing drift guard.
 *
 * Returns 0 (never throws) when the driver has no bound escrow bridge yet — matches this function's
 * original "no escrow history = 0" contract; a driver with genuinely no escrow activity is not an error.
 * Entity-scoped (caller sets app.operating_company_id). Read-only.
 */
export async function readDriverEscrowBalanceCents(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string
): Promise<number> {
  const res = await client.query<{ balance_cents: number | string | null }>(
    `
      SELECT ea.balance_cents
      FROM accounting.escrow_accounts ea
      WHERE ea.operating_company_id = $1::uuid
        AND ea.holder_id = $2::uuid
        AND ea.holder_type = 'driver'
      LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );
  return Math.max(0, Math.round(Number(res.rows[0]?.balance_cents ?? 0)));
}

/**
 * Capped escrow contribution (PURE): contribute the standard per-settlement amount, but only up to the
 * **$2,500** cap — contribution = min(standard, max(0, ESCROW_CAP_CENTS − currentBalance)). At/over the
 * cap → 0. Never negative. Never a release. This is THE function that performs the capped escrow
 * contribution. The cap is read from ESCROW_CAP_CENTS — never hardcode it here again: the old $2,000
 * literal outlived the constant it described and turned this doc into a lie (owner ruling C2b,
 * 2026-07-26). Guard verify-escrow-cap-owner-locked A2 now fails on any stale cap literal in this file.
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
