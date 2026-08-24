import type { PgClient } from "./samsara.service.js";

export type ActiveHosDriver = {
  local_driver_id: string;
  samsara_driver_id: string;
  unit_id: string | null;
};

/**
 * Return the selected company's active Samsara board roster.
 *
 * Driver identity may be owned by another company and shared through the
 * canonical authorization table. The assignment itself always belongs to the
 * selected company; otherwise one tenant's open pairing could feed another
 * tenant's HOS poll.
 */
export async function listActiveHosDriverRoster(
  client: PgClient,
  operatingCompanyId: string
): Promise<ActiveHosDriver[]> {
  const active = await client.query(
    `SELECT DISTINCT ON (d.id)
       d.id::text AS local_driver_id,
       d.samsara_driver_id::text AS samsara_driver_id,
       a.unit_id::text AS unit_id
     FROM mdata.drivers d
     JOIN telematics.vehicle_driver_assignments a
       ON a.driver_id = d.id
      AND a.operating_company_id = $1::uuid
      AND a.ended_at IS NULL
     WHERE (
             d.operating_company_id = $1::uuid
             OR EXISTS (
               SELECT 1
                 FROM mdata.driver_company_authorizations dca
                WHERE dca.driver_id = d.id
                  AND dca.operating_company_id = $1::uuid
                  AND dca.is_authorized = true
                  AND dca.deactivated_at IS NULL
             )
           )
       AND d.samsara_driver_id IS NOT NULL
       AND d.deactivated_at IS NULL
     ORDER BY d.id, a.started_at DESC`,
    [operatingCompanyId]
  );
  return active.rows as ActiveHosDriver[];
}
