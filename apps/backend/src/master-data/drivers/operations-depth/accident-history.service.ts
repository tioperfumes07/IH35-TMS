import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type AccidentHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  unit_id: string | null;
  unit_number: string | null;
  load_id: string | null;
  load_number: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  occurred_at: string | null;
  description: string | null;
  at_fault: string | null;
  preventable: boolean | null;
};

/**
 * Driver accident history — cross-linked to safety incident / accident reports.
 * Scoped to one driver inside one operating company; paged for large drivers.
 *
 * §4 landmine (fixed 2026-07-06): `safety.accident_reports` (base 0049 + SC1 202607031500 +
 * SAFE-1 202607050830) has NO `created_at` and NO `incident_id`/`severity` columns — its real
 * columns are id/operating_company_id/driver_id/unit_id/vendor_id/load_id/accident_at/description/
 * at_fault/preventable. The prior SELECT of `created_at` 42703'd (column does not exist) → this
 * sub-view 500'd on every request. Fixed to select only real columns, aliasing accident_at to the
 * generic `occurred_at` timeline field the frontend expects and ordering by it directly.
 */
export async function getDriverAccidentHistory(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<AccidentHistoryRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM safety.accident_reports
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<AccidentHistoryRow>(
    `
      SELECT
        ar.id::text AS uuid,
        ar.driver_id::text,
        ar.operating_company_id::text,
        ar.unit_id::text,
        NULLIF(TRIM(u.unit_number), '') AS unit_number,
        ar.load_id::text,
        NULLIF(TRIM(l.load_number), '') AS load_number,
        ar.vendor_id::text,
        NULLIF(TRIM(v.vendor_name), '') AS vendor_name,
        ar.accident_at::text AS occurred_at,
        ar.description,
        ar.at_fault,
        ar.preventable
      FROM safety.accident_reports ar
      LEFT JOIN mdata.units u
        ON u.id = ar.unit_id
       AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
      LEFT JOIN mdata.loads l
        ON l.id = ar.load_id
       AND l.operating_company_id = $2::uuid
      LEFT JOIN mdata.vendors v
        ON v.id = ar.vendor_id
       AND v.operating_company_id = $2::uuid
      WHERE ar.driver_id = $1::uuid
        AND ar.operating_company_id = $2::uuid
      ORDER BY ar.accident_at DESC NULLS LAST
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
