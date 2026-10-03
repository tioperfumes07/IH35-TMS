/**
 * OWNER ORDER 2026-10-03 — KILL THE SECOND SYSTEM, tables 2-5 (CC-1).
 *
 * driver_finance.escrow_balances no longer stores an amount (current / held / released died with migration
 * 202615380100) and driver_finance.escrow_ledger no longer stores a running balance: the driver's escrow balance is
 * his 2100-00-nnn GL sub-account, read through driver_finance.v_escrow_balances / v_driver_escrow_balance. What stays
 * is the escrow_balances ROW — the identity the ledger rows point at (escrow_ledger.escrow_balance_id) plus its
 * settlement / release-schedule fields — and every ledger row (the movement history).
 *
 * Every writer that used to "upsert the running total" calls this instead: it makes sure the identity row exists and
 * returns its id. It writes no amount, ever.
 */
type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

// ESCROW-SYNC-EXEMPT: identity row only — this writes no amount (KILL THE SECOND SYSTEM tables 2-5), so there is nothing to
// sync to the GL; every caller makes its own GL / escrow_postings write (forfeit, separation, pay-run close, unwind,
// settlement approval, history backfill).
export async function ensureEscrowBalanceRow(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string,
  opts: { lastSettlementId?: string | null } = {},
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO driver_finance.escrow_balances (operating_company_id, driver_id, last_settlement_id, last_updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, now())
     ON CONFLICT (operating_company_id, driver_id) DO UPDATE SET
       last_settlement_id = COALESCE(EXCLUDED.last_settlement_id, driver_finance.escrow_balances.last_settlement_id),
       last_updated_at = now()
     RETURNING id::text`,
    [operatingCompanyId, driverId, opts.lastSettlementId ?? null],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error("ensureEscrowBalanceRow: driver_finance.escrow_balances upsert returned no id");
  return id;
}
