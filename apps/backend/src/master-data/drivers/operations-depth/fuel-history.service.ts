import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type FuelHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  transaction_date: string | null;
  merchant: string | null;
  gallons: string | null;
  total_amount: string | null;
  vendor_id: string | null;
  unit_id: string | null;
  unit_number: string | null;
  load_id: string | null;
  load_number: string | null;
  created_at: string;
};

/**
 * Driver fuel history — per-driver fuel transactions.
 * Scoped to one driver inside one operating company; paged for large drivers.
 *
 * §4 fix (2026-07-06): real columns are `transaction_at` / `location_city` / `total_cost` (migration
 * 0300) but the frontend's FuelHistoryView column keys were `transaction_date` / `merchant` /
 * `total_amount` — a name mismatch that silently rendered every cell "—". Aliased to the frontend's
 * real keys; `merchant` prefers the linked vendor's real name (fuel.fuel_transactions.vendor_id has
 * no FK constraint but is populated from mdata.vendors on import) and falls back to the fuel-stop
 * city when no vendor is linked (still real data, never fabricated), archived rows excluded
 * (void-not-delete: `archived_at IS NULL`).
 */
export async function getDriverFuelHistory(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<FuelHistoryRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM fuel.fuel_transactions
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND archived_at IS NULL
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<FuelHistoryRow>(
    `
      SELECT
        ft.id::text AS uuid,
        ft.driver_id::text,
        ft.operating_company_id::text,
        ft.transaction_at::text AS transaction_date,
        COALESCE(v.vendor_name, ft.location_city) AS merchant,
        ft.gallons::text,
        ft.total_cost::text AS total_amount,
        ft.vendor_id::text,
        ft.unit_id::text,
        NULLIF(TRIM(u.unit_number), '') AS unit_number,
        ft.load_id::text,
        NULLIF(TRIM(l.load_number), '') AS load_number,
        ft.created_at::text
      FROM fuel.fuel_transactions ft
      LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id AND v.operating_company_id = ft.operating_company_id
                                AND v.operating_company_id = $2::uuid
      LEFT JOIN mdata.units u ON u.id = ft.unit_id
                              AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
      LEFT JOIN mdata.loads l ON l.id = ft.load_id
                              AND l.operating_company_id = $2::uuid
      WHERE ft.driver_id = $1::uuid
        AND ft.operating_company_id = $2::uuid
        AND ft.archived_at IS NULL
      ORDER BY ft.transaction_at DESC NULLS LAST, ft.created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
