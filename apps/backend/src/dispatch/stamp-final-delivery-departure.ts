/**
 * CLS-DISP-WIRE-07 / ACCT-F81 — stamp `actual_departure_at` on the final active delivery stop
 * when office (or bulk) confirms delivery. Shared by:
 *   - PATCH /api/v1/dispatch/loads/:id/transition
 *   - bulk dispatch loads set_status
 *   - PATCH /api/v1/mdata/loads/:id/status
 *
 * NEVER OVERWRITE an existing driver-captured departure.
 * actual_arrival_at is left NULL (office is not asserting arrival).
 */
import type { PoolClient } from "pg";

const DELIVERY_EVIDENCE_STATUSES = new Set([
  "delivered_pending_docs",
  "completed_docs_received",
]);

export function loadStatusRequiresDeliveryDepartureStamp(status: string): boolean {
  return DELIVERY_EVIDENCE_STATUSES.has(status);
}

/**
 * @returns number of stop rows updated (0 or 1)
 */
export async function stampFinalActiveDeliveryDeparture(
  client: PoolClient,
  loadId: string,
  deliveredAt: string | Date | null | undefined = null
): Promise<number> {
  const res = await client.query(
    `
      UPDATE mdata.load_stops s
         SET actual_departure_at = COALESCE($2::timestamptz, now()),
             status = 'departed'::mdata.stop_status_enum,
             updated_at = now()
       WHERE s.id = (
               SELECT s2.id
                 FROM mdata.load_stops s2
                WHERE s2.load_id = $1
                  AND s2.stop_type::text = 'delivery'
                  AND s2.status::text <> 'cancelled'
                  AND s2.soft_deleted_at IS NULL
                ORDER BY s2.sequence_number DESC
                LIMIT 1
             )
         AND s.actual_departure_at IS NULL
    `,
    [loadId, deliveredAt ?? null]
  );
  return res.rowCount ?? 0;
}
