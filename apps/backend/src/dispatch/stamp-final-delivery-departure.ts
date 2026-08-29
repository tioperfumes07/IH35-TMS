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
/**
 * Accept PoolClient OR the thinner `{ query }` wrappers used by route tx helpers.
 * Requiring full PoolClient caused TS2345 on loads.routes / loads-bulk.routes (CI red).
 */
type Queryable = {
  query: (
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

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
  client: Queryable,
  operatingCompanyId: string,
  loadId: string,
  deliveredAt: string | Date | null | undefined = null
): Promise<number> {
  const res = await client.query(
    `
      UPDATE mdata.load_stops s
         SET actual_departure_at = COALESCE($3::timestamptz, now()),
             status = 'departed'::mdata.stop_status_enum,
             updated_at = now()
       WHERE s.id = (
               SELECT s2.id
                 FROM mdata.load_stops s2
                 JOIN mdata.loads l2 ON l2.id = s2.load_id
                WHERE s2.load_id = $1
                  AND l2.operating_company_id = $2::uuid
                  AND l2.soft_deleted_at IS NULL
                  AND s2.stop_type::text = 'delivery'
                  AND s2.status::text <> 'cancelled'
                  AND s2.soft_deleted_at IS NULL
                ORDER BY s2.sequence_number DESC
                LIMIT 1
             )
         AND s.actual_departure_at IS NULL
    `,
    [loadId, operatingCompanyId, deliveredAt ?? null]
  );
  return res.rowCount ?? 0;
}
