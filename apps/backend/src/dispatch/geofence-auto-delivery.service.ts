/**
 * ROUND 315 (Lead GO 2026-10-01) — auto-status, GEOFENCE-EVIDENCE PATH ONLY.
 *
 * A load still in dispatch work whose FINAL delivery stop carries a departure stamped from telematics
 * (actual_arrival_source 'eld_geofence' -- written by the canonical fence detector or a GPS-evidence backfill,
 * never typed) is delivered. Status lagged that evidence because nothing moved it (13626, 13637: delivered,
 * still 'dispatched'). This engine walks the canonical state graph through the ONE transition service the office
 * route uses (transitionDispatchLoadInClientTx): dispatched -> in_transit -> delivered_pending_docs. The
 * delivered step runs the same side effects as an office delivery -- departure stamp (never overwrites, so the
 * fence time stays), driver bill mint, revenue latch + invoice after COMMIT, settlement ping, spine event.
 *
 * Writes only when AUTO_DELIVERY_FROM_GEOFENCE_APPLY=true (default OFF). The older GPS-drift auto-switch
 * (AUTO_STATUS_SWITCH_APPLY) is a different heuristic and stays OFF.
 */
import { canonicalDispatchWorkStatusClause } from "./canonical-active-load-set.js";
import { transitionDispatchLoadInClientTx, type TransitionClient } from "./load-transition.service.js";

export const GEOFENCE_AUTO_DELIVERY_ACTOR = "00000000-0000-4000-8000-000000000001";

export function geofenceAutoDeliveryEnabled(): boolean {
  return process.env.AUTO_DELIVERY_FROM_GEOFENCE_APPLY === "true";
}

export type AutoDeliveryCandidate = { load_id: string; load_number: string; status: string; departed_at: string; pickup_departed: boolean };

/** Loads in dispatch work whose final active delivery stop has a telematics-evidenced departure. */
export async function listGeofenceDeliveredLoads(client: TransitionClient, operatingCompanyId: string): Promise<AutoDeliveryCandidate[]> {
  const r = await client.query<AutoDeliveryCandidate>(
    `SELECT l.id::text AS load_id, l.load_number, l.status::text AS status, d.actual_departure_at::text AS departed_at,
            EXISTS (SELECT 1 FROM mdata.load_stops p WHERE p.load_id = l.id AND p.stop_type::text = 'pickup'
                     AND p.soft_deleted_at IS NULL AND p.actual_departure_at IS NOT NULL) AS pickup_departed
       FROM mdata.loads l
       JOIN LATERAL (
         SELECT s.actual_departure_at, s.actual_arrival_source FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type::text = 'delivery' AND s.soft_deleted_at IS NULL
            AND COALESCE(s.status::text, '') <> 'cancelled'
          ORDER BY s.sequence_number DESC LIMIT 1
       ) d ON true
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL AND COALESCE(l.is_sample_data, false) = false
        AND ${canonicalDispatchWorkStatusClause("l")}
        AND d.actual_departure_at IS NOT NULL
        AND d.actual_arrival_source = 'eld_geofence'
      ORDER BY d.actual_departure_at`,
    [operatingCompanyId]
  );
  return r.rows;
}

/** Walk one load to delivered through the canonical transition. Returns each step's outcome. */
export async function autoDeliverLoad(client: TransitionClient, operatingCompanyId: string, c: AutoDeliveryCandidate) {
  const steps: Array<Record<string, unknown>> = [];
  if (c.status === "dispatched") {
    const r = await transitionDispatchLoadInClientTx(client, GEOFENCE_AUTO_DELIVERY_ACTOR, operatingCompanyId, c.load_id, { new_status: "in_transit" });
    steps.push({ to: "in_transit", ...r });
    if ("error" in r) return { load_number: c.load_number, steps };
  } else if (c.status !== "in_transit") {
    return { load_number: c.load_number, steps: [{ skipped: `status_${c.status}_not_on_the_auto_path` }] };
  }
  const r = await transitionDispatchLoadInClientTx(client, GEOFENCE_AUTO_DELIVERY_ACTOR, operatingCompanyId, c.load_id, {
    new_status: "delivered_pending_docs",
    delivered_at: c.departed_at,
  });
  steps.push({ to: "delivered_pending_docs", ...r });
  return { load_number: c.load_number, steps };
}
