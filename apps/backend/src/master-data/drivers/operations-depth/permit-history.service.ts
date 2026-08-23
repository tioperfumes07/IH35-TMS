import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type PermitHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  permit_type: string;
  issuing_state: string | null;
  permit_number: string | null;
  expiration_date: string | null;
  created_at: string;
};

/**
 * Driver permit history — CDL, DOT medical card and hazmat endorsement, with expiry dates.
 * Scoped to one driver inside one operating company; paged for large drivers.
 *
 * §4 landmine (fixed 2026-07-06): the prior query read `safety.permits` filtered by `driver_id` —
 * that column does not exist on `safety.permits` (migration 0348_safety_permits.sql: the table is a
 * FLEET/unit operating-permits register — state_operating_authority / ifta_sticker / oversize_overweight
 * / hazmat / other — scoped by `unit_id`, not per-driver; confirmed by document-alerts.service.ts's own
 * "permit" candidate query, which always returns `driver_id: NULL` for this table). The 42703 on the
 * phantom `driver_id` column 500'd this sub-view on every request, and even a column-existence fix would
 * have returned the WRONG driver's rows (or none) because the table has no driver linkage at all.
 *
 * There is no dedicated "driver permit history" table in the schema (flagged — a real point-in-time
 * renewal ledger would need a new migration; not built here, see PR notes). The closest real, honest,
 * non-fabricated per-driver credential data available today without a migration is:
 *   - CDL:               mdata.drivers.cdl_number / cdl_state / cdl_expires_at        (current state)
 *   - DOT medical card:  safety.medical_cards (driver_id, card_number, expiry_date)    (real history —
 *                        multiple cards over time, migration 0248)
 *   - Hazmat endorsement: mdata.drivers.hazmat_endorsement_expires_at                  (current state)
 * UNIONed into one paged timeline, ordered by expiration date, replacing the phantom-table read.
 */
export async function getDriverPermitHistory(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<PermitHistoryRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);

  const cte = `
    WITH permit_rows AS (
      SELECT
        'cdl:' || d.id::text AS uuid,
        d.id::text AS driver_id,
        d.operating_company_id::text,
        'CDL'::text AS permit_type,
        d.cdl_state AS issuing_state,
        d.cdl_number AS permit_number,
        d.cdl_expires_at::text AS expiration_date,
        d.updated_at::text AS created_at
      FROM mdata.drivers d
      WHERE d.id = $1::uuid
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations permit_cdl_dca
            WHERE permit_cdl_dca.driver_id = d.id
              AND permit_cdl_dca.company_id = $2::uuid
              AND permit_cdl_dca.is_authorized = true
              AND permit_cdl_dca.deactivated_at IS NULL
          )
        )
        AND (d.cdl_number IS NOT NULL OR d.cdl_expires_at IS NOT NULL)

      UNION ALL

      SELECT
        mc.id::text AS uuid,
        mc.driver_id::text,
        mc.operating_company_id::text,
        'DOT Medical Card'::text AS permit_type,
        NULL::text AS issuing_state,
        mc.card_number AS permit_number,
        mc.expiry_date::text AS expiration_date,
        mc.created_at::text
      FROM safety.medical_cards mc
      WHERE mc.driver_id = $1::uuid
        AND mc.operating_company_id = $2::uuid
        AND mc.voided_at IS NULL

      UNION ALL

      SELECT
        'hazmat:' || d.id::text AS uuid,
        d.id::text AS driver_id,
        d.operating_company_id::text,
        'Hazmat Endorsement'::text AS permit_type,
        NULL::text AS issuing_state,
        NULL::text AS permit_number,
        d.hazmat_endorsement_expires_at::text AS expiration_date,
        d.updated_at::text AS created_at
      FROM mdata.drivers d
      WHERE d.id = $1::uuid
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations permit_hazmat_dca
            WHERE permit_hazmat_dca.driver_id = d.id
              AND permit_hazmat_dca.company_id = $2::uuid
              AND permit_hazmat_dca.is_authorized = true
              AND permit_hazmat_dca.deactivated_at IS NULL
          )
        )
        AND (d.endorsement_h IS TRUE OR d.hazmat_endorsement_expires_at IS NOT NULL)
    )
  `;

  const totalRes = await client.query<{ total: string }>(
    `${cte} SELECT COUNT(*)::text AS total FROM permit_rows`,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);

  const res = await client.query<PermitHistoryRow>(
    `
      ${cte}
      SELECT *
      FROM permit_rows
      ORDER BY expiration_date DESC NULLS LAST
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
