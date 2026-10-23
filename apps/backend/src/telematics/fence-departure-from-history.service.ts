/**
 * LEAD 443.279 — a load at delivered* whose FINAL active delivery stop has an arrival but no departure is two sources
 * of truth: the status says delivered, the stop says the truck never left. Until 443.279 the fence detector delivered on
 * ARRIVAL and the stop fence was retired a few minutes later (load left dispatch work), so the real EXIT was never seen:
 * 13691 / 13694 / 13696 / 13697 sat delivered with driver pay basis 'projected' and revenue unearned.
 *
 * This engine completes such a stop from the truck's OWN stored GPS fixes (telematics.vehicle_locations): the departure
 * is the first fix after the arrival that lies OUTSIDE that stop's fence polygon — exactly the point the live detector
 * would have written as the exit had the fence still been active. It writes through the ONE stop engine
 * (dispatch/stop-stamp.service.ts stampStopDeparture, evidence time `at`, source 'eld_geofence'), which runs the revenue
 * latch, settlement ping and audit like any departure. No fix outside the fence = no evidence = nothing is written
 * (never an invented time; the guard keeps the load visible until a fix or the POD arrives).
 */
import { stampStopDeparture, type LockedStopRow } from "../dispatch/stop-stamp.service.js";
import { DELIVERY_EVIDENCE_MDATA_STATUSES } from "../dispatch/delivery-evidence-status.js";
import { GEOFENCE_AUTO_DELIVERY_ACTOR } from "../dispatch/geofence-auto-delivery.service.js";
import { normalizeVertices, pointInPolygon } from "./geofence.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type DeliveredWithoutDeparture = {
  load_id: string;
  load_number: string;
  stop_id: string;
  sequence_number: number;
  unit_id: string | null;
  arrived_at: string;
};

export type FenceDepartureOutcome =
  | { load_number: string; outcome: "stamped"; departed_at: string; fix_id: string }
  | { load_number: string; outcome: "no_evidence" | "no_fence" | "no_unit" | "refused"; detail?: string };

/** Loads at delivered* whose final active delivery stop carries an arrival and no departure (the 443.279 split). */
export async function listDeliveredWithoutFinalDeparture(client: DbClient, operatingCompanyId: string): Promise<DeliveredWithoutDeparture[]> {
  const r = await client.query<DeliveredWithoutDeparture>(
    `SELECT l.id::text AS load_id, l.load_number, f.id::text AS stop_id, f.sequence_number,
            l.assigned_unit_id::text AS unit_id, f.actual_arrival_at::text AS arrived_at
       FROM mdata.loads l
       JOIN LATERAL (
         SELECT s.id, s.sequence_number, s.actual_arrival_at, s.actual_departure_at
           FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type::text = 'delivery' AND s.soft_deleted_at IS NULL
            AND COALESCE(s.status::text, '') <> 'cancelled'
          ORDER BY s.sequence_number DESC LIMIT 1
       ) f ON true
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL AND COALESCE(l.is_sample_data, false) = false
        AND l.status::text = ANY($2::text[])
        AND f.actual_arrival_at IS NOT NULL AND f.actual_departure_at IS NULL
      ORDER BY l.load_number`,
    [operatingCompanyId, [...DELIVERY_EVIDENCE_MDATA_STATUSES]]
  );
  return r.rows;
}

/** First stored fix after the arrival that lies outside the stop's fence polygon (retired fences included). */
export async function findFenceExitFix(
  client: DbClient,
  operatingCompanyId: string,
  row: DeliveredWithoutDeparture
): Promise<{ fix_id: string; captured_at: string } | "no_fence" | null> {
  const fence = (
    await client.query<{ vertices_json: unknown }>(
      `SELECT vertices_json FROM geo.geofences
        WHERE operating_company_id = $1::uuid AND label = 'load-' || $2::text || '-stop-' || $3::text
        ORDER BY created_at, id LIMIT 1`,
      [operatingCompanyId, row.load_id, String(row.sequence_number)]
    )
  ).rows[0];
  const vertices = fence ? normalizeVertices(fence.vertices_json) : [];
  if (vertices.length < 3) return "no_fence";
  const fixes = await client.query<{ id: string; lat: string; lng: string; captured_at: string }>(
    `SELECT id::text, lat::text, lng::text, captured_at::text FROM telematics.vehicle_locations
      WHERE operating_company_id = $1::uuid AND unit_id = $2::uuid AND captured_at > $3::timestamptz
      ORDER BY captured_at ASC, id ASC`,
    [operatingCompanyId, row.unit_id, row.arrived_at]
  );
  for (const f of fixes.rows) {
    if (!pointInPolygon(Number(f.lat), Number(f.lng), vertices)) return { fix_id: f.id, captured_at: f.captured_at };
  }
  return null;
}

/** Complete one load's final departure from fence history through the stop engine (caller owns the transaction). */
export async function completeFinalDepartureFromFenceHistory(
  client: DbClient,
  operatingCompanyId: string,
  row: DeliveredWithoutDeparture
): Promise<FenceDepartureOutcome> {
  if (!row.unit_id) return { load_number: row.load_number, outcome: "no_unit" };
  const exit = await findFenceExitFix(client, operatingCompanyId, row);
  if (exit === "no_fence") return { load_number: row.load_number, outcome: "no_fence" };
  if (!exit) return { load_number: row.load_number, outcome: "no_evidence", detail: "no stored fix outside the stop fence yet" };
  const stop = (
    await client.query<LockedStopRow & { status: string }>(
      `SELECT s.id::text, s.stop_type::text, s.status::text, l.status::text AS load_status,
              l.operating_company_id::text AS operating_company_id
         FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
        WHERE s.id = $1::uuid AND s.load_id = $2::uuid AND l.operating_company_id = $3::uuid
          AND s.soft_deleted_at IS NULL AND l.soft_deleted_at IS NULL
        LIMIT 1
        FOR UPDATE OF s, l`,
      [row.stop_id, row.load_id, operatingCompanyId]
    )
  ).rows[0];
  if (!stop) return { load_number: row.load_number, outcome: "refused", detail: "stop not found" };
  const result = await stampStopDeparture(client as never, stop, {
    loadId: row.load_id,
    actorUserId: GEOFENCE_AUTO_DELIVERY_ACTOR,
    source: "eld_geofence",
    auditEvent: "dispatch.stop.departure_from_fence_history",
    at: exit.captured_at,
  });
  if (!result.ok) return { load_number: row.load_number, outcome: "refused", detail: result.error };
  return { load_number: row.load_number, outcome: "stamped", departed_at: exit.captured_at, fix_id: exit.fix_id };
}
