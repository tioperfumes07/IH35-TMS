/**
 * Canonical banking / driver escrow KPI counts (Block B7).
 * @see docs/specs/KPI_SOURCES_OF_TRUTH.md
 */

export const DRIVER_ESCROW_KPI_LABELS = {
  escrow_balance_dip: "Escrow Balance (DIP virtual)",
  drivers_with_escrow_balance: "Drivers with Escrow Balance",
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
  const withBalanceRes = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM mdata.drivers
      WHERE operating_company_id = $1
        AND deactivated_at IS NULL
        AND COALESCE(escrow_balance, 0) > 0
    `,
    [operatingCompanyId]
  );
  const withAccountRes = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM mdata.drivers
      WHERE operating_company_id = $1
        AND deactivated_at IS NULL
        AND escrow_balance IS NOT NULL
    `,
    [operatingCompanyId]
  );
  return {
    active_drivers: Number(activeRes.rows[0]?.count ?? 0),
    drivers_with_escrow_balance: Number(withBalanceRes.rows[0]?.count ?? 0),
    drivers_with_active_escrow_account: Number(withAccountRes.rows[0]?.count ?? 0),
  };
}
