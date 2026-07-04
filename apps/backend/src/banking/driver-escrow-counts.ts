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
      WHERE operating_company_id = $1
        AND deactivated_at IS NULL
        AND lower(coalesce(status::text, '')) = 'active'
    `,
    [operatingCompanyId]
  );
  // §4 landmine: there is NO mdata.drivers.escrow_balance column. Driver escrow lives in
  // driver_finance.escrow_balances (current_balance_cents, keyed by operating_company_id + driver_id —
  // migration 202606120600). The prior `COALESCE(escrow_balance, 0)` / `escrow_balance IS NOT NULL`
  // 42703'd → this KPI count 500'd. Read the real escrow table.
  const withBalanceRes = await client.query<{ count: number }>(
    `
      SELECT count(DISTINCT d.id)::int AS count
      FROM mdata.drivers d
      JOIN driver_finance.escrow_balances eb
        ON eb.driver_id = d.id
        AND eb.operating_company_id = d.operating_company_id
      WHERE d.operating_company_id = $1
        AND d.deactivated_at IS NULL
        AND COALESCE(eb.current_balance_cents, 0) <> 0
    `,
    [operatingCompanyId]
  );
  const withAccountRes = await client.query<{ count: number }>(
    `
      SELECT count(DISTINCT d.id)::int AS count
      FROM mdata.drivers d
      JOIN driver_finance.escrow_balances eb
        ON eb.driver_id = d.id
        AND eb.operating_company_id = d.operating_company_id
      WHERE d.operating_company_id = $1
        AND d.deactivated_at IS NULL
    `,
    [operatingCompanyId]
  );
  return {
    active_drivers: Number(activeRes.rows[0]?.count ?? 0),
    drivers_with_escrow_balance: Number(withBalanceRes.rows[0]?.count ?? 0),
    drivers_with_active_escrow_account: Number(withAccountRes.rows[0]?.count ?? 0),
  };
}
