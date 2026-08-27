/**
 * Canonical banking / driver escrow KPI counts (Block B7).
 * @see docs/specs/KPI_SOURCES_OF_TRUTH.md
 */

export const DRIVER_ESCROW_KPI_LABELS = {
  escrow_balance_dip: "Escrow Balance (DIP virtual)",
  drivers_with_escrow_balance: "Drivers with escrow",
  active_drivers: "Active Drivers",
} as const;

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type DriverEscrowKpiCounts = {
  active_drivers: number;
  drivers_with_escrow_balance: number;
  drivers_with_active_escrow_account: number;
};

export async function countDriverEscrowKpis(client: Queryable, operatingCompanyId: string): Promise<DriverEscrowKpiCounts> {
  const activeRes = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
        AND lower(coalesce(status::text, '')) = 'active'
    `,
    [operatingCompanyId]
  );
  // ACCT-F5703: driver_finance.escrow_balances is a separate, near-empty operational ledger (1 row
  // system-wide, live-confirmed 2026-08-21) that was never kept in sync with the real GL-linked
  // liability subledger, accounting.escrow_accounts (Block-23) — the same table /accounting/escrow
  // already reads correctly. Repointed here so this KPI count matches reality.
  //
  // DRIVER-ESCROW-VISUALIZER-BALANCES-AVAILABLE-LABEL-MISLEADING-COUNT (residual): this query used
  // to also require `d.deactivated_at IS NULL`, silently excluding a deactivated-but-still-owing
  // driver from the count even when they hold a real nonzero escrow balance — a completeness gap
  // on a liability-tracking KPI (Banking Home showed 1, /banking/driver-escrow's post-fix count
  // showed 2). Dropped that filter to match escrow-visualizer.routes.ts's own documented policy: a
  // separated/terminated driver's outstanding escrow is a real liability the company still
  // owes/holds (see escrow-separation.service.ts) and must not silently disappear from a count.
  // The INNER JOIN + nonzero-balance filter below already scope this to drivers with a REAL
  // balance regardless of active/deactivated status — no separate deactivated-inclusion clause
  // is needed.
  const withBalanceRes = await client.query<{ count: number }>(
    `
      SELECT count(DISTINCT d.id)::int AS count
      FROM mdata.drivers d
      JOIN accounting.escrow_accounts ea
        ON ea.holder_id = d.id
        AND ea.holder_type = 'driver'
        AND ea.purpose = 'driver_bond'
        AND ea.operating_company_id = d.operating_company_id
      WHERE d.operating_company_id = $1::uuid
        AND COALESCE(ea.balance_cents, 0) <> 0
    `,
    [operatingCompanyId]
  );
  const withAccountRes = await client.query<{ count: number }>(
    `
      SELECT count(DISTINCT d.id)::int AS count
      FROM mdata.drivers d
      JOIN accounting.escrow_accounts ea
        ON ea.holder_id = d.id
        AND ea.holder_type = 'driver'
        AND ea.purpose = 'driver_bond'
        AND ea.operating_company_id = d.operating_company_id
      WHERE d.operating_company_id = $1::uuid
        AND d.deactivated_at IS NULL
        AND ea.status = 'active'
    `,
    [operatingCompanyId]
  );
  return {
    active_drivers: Number(activeRes.rows[0]?.count ?? 0),
    drivers_with_escrow_balance: Number(withBalanceRes.rows[0]?.count ?? 0),
    drivers_with_active_escrow_account: Number(withAccountRes.rows[0]?.count ?? 0),
  };
}
