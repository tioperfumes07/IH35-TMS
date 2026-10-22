/**
 * CLS-DISP-WIRE-07 / ACCT-F81 — stamp `actual_departure_at` on the final active delivery stop
 * when office (or bulk) confirms delivery. Shared by:
 *   - PATCH /api/v1/dispatch/loads/:id/transition
 *   - bulk dispatch loads set_status
 *   - PATCH /api/v1/mdata/loads/:id/status
 *
 * NEVER OVERWRITE an existing driver-captured departure.
 * actual_arrival_at is left NULL (office is not asserting arrival).
 *
 * LEAD 443.230 (CC-3) — the load's EARLIER stops (pickups, earlier drops) still unstamped are then stamped from the truck's
 * own tracking through THE stop-evidence engine (driver-finance/settlement-creator-deliver.ts stampStopsFromTracking:
 * the unit's stop event at the stop's coordinates on its date, else the date only — never an invented clock time) and
 * settled to 'departed'. Before, an office-delivered load kept every earlier stop 'pending' (13687 / 13688 on 10-22,
 * verify-delivered-load-stops-terminal RULE 2). A stop already carrying any stamp is never touched.
 */
import { loadStatusRequiresDeliveryDepartureStamp } from "./delivery-evidence-status.js";

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

export { loadStatusRequiresDeliveryDepartureStamp };

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
             actual_departure_source = 'manual',
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
  await stampEarlierStopsOnDelivery(client, operatingCompanyId, loadId);
  return res.rowCount ?? 0;
}

/**
 * LEAD 443.230 / 443.234 — a DELIVERED load's earlier stops still unstamped are stamped from the truck's tracking (the
 * stop-evidence engine) and settled. Shared by the office stamp above AND the geofence delivery path (departure_evidence
 * 'fence', which skips the office departure stamp — 13691 kept its pickup 'pending'). A delivered load's stops did happen.
 */
export async function stampEarlierStopsOnDelivery(client: Queryable, operatingCompanyId: string, loadId: string): Promise<void> {
  // Dynamic import: settlement-creator-deliver imports the transition engine, which imports this module.
  const { stampStopsFromTracking } = await import("../driver-finance/settlement-creator-deliver.js");
  await stampStopsFromTracking(client as never, loadId, operatingCompanyId, {});
}
