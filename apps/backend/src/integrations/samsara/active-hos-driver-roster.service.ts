import type { PgClient } from "./samsara.service.js";

export type ActiveHosDriver = {
  local_driver_id: string;
  samsara_driver_id: string;
  unit_id: string | null;
};

/**
 * Return the selected company's active Samsara HOS roster.
 *
 * HOS is per driver in Samsara — not only drivers with an open truck pairing.
 * Every Active driver with a mapped samsara_driver_id is polled; an optional
 * OPEN vehicle assignment supplies unit_id when the driver is currently paired.
 *
 * Driver identity may be owned by another company and shared through the
 * canonical authorization table. Assignments always belong to the selected
 * company so one tenant's open pairing cannot feed another tenant's HOS poll.
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
     LEFT JOIN telematics.vehicle_driver_assignments a
       ON a.driver_id = d.id
      AND a.operating_company_id = $1::uuid
      AND a.ended_at IS NULL
     WHERE (
             d.operating_company_id = $1::uuid
             OR EXISTS (
               SELECT 1
                 FROM mdata.driver_company_authorizations dca
                WHERE dca.driver_id = d.id
                  AND dca.company_id = $1::uuid
                  AND dca.is_authorized = true
                  AND dca.deactivated_at IS NULL
             )
           )
       AND d.samsara_driver_id IS NOT NULL
       AND d.deactivated_at IS NULL
       AND d.status = 'Active'
     ORDER BY d.id, a.started_at DESC NULLS LAST`,
    [operatingCompanyId]
  );
  return active.rows as ActiveHosDriver[];
}
