/**
 * ENGINE: canonical geofence detector — turns a GPS fix into fence enter / exit events, stamps load-stop arrival / departure, mints the first-pickup proforma, prompts the driver, runs DOT dwell
 * SCHEDULE: on demand — webhook-projectors/vehicle-projector.ts + geofence-projector.ts (every minute), samsara-positions.service.ts (cron/samsara-positions-cron.ts *\/5 * * * *), load-stop-geofence-sync.service.ts, geofence-events-backfill.service.ts
 * WRITES: geo.geofence_events, mdata.load_stops (actual_arrival_* / actual_departure_*), mdata.loads.status ONLY via dispatch/load-transition.service.ts (G11/AJK-03), the non-posting proforma via accounting/proforma-mint-on-first-pickup.ts, compliance.dot_inspection_events; external: driver web push
 * IDEMPOTENCY: ADVISORY LOCK geo.fence_transition:<fence>:<unit> + UNIQUE(operating_company_id, geofence_id, unit_id, event_kind, occurred_at, source) ON CONFLICT (uq_geo_geofence_events_dedupe, migration 0220); stop stamps SAME-STATEMENT WHERE actual_arrival_at / actual_departure_at IS NULL
 * OVERLAP: the second caller waits on the fence+unit lock, then sees the first's event inside the 5-minute window and skips; side effects run only for a newly inserted event
 * REVERSE: NOT-A-DOCUMENT — immutable fence evidence; stop stamps are first-write-only
 * NEVER: must never overwrite an existing stop arrival / departure stamp, and must not fire side effects on a historical replay (suppressOperationalSideEffects)
 * (ROUND 337 header — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
import { processDotDwellForGeofenceEvent } from "./dot-dwell-detector.service.js";
import { mintProformaInvoiceOnFirstPickup } from "../accounting/proforma-mint-on-first-pickup.js";
import { assertCanonicalSubset, canonicalDispatchWorkWhereClause } from "../dispatch/canonical-active-load-set.js";
import { GEOFENCE_AUTO_DELIVERY_ACTOR } from "../dispatch/geofence-auto-delivery.service.js";
import { transitionDispatchLoadInClientTx } from "../dispatch/load-transition.service.js";
import { fromMdataStatus, type DispatchStatus } from "../dispatch/load-state-machine.js";
import { latchOnDeliveryEvidence } from "../dispatch/delivery-evidence-latch.js";
import { pingSettlementOnLoadEvent } from "../driver-finance/settlements-load-bookended.service.js";
import { normalizeVertices, pointInPolygon } from "./geofence.js";
import { withSavepoint } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
export { pointInPolygon } from "./geofence.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Forward path the fence detector may walk through the ONE transition engine (AJK-03 / G11). */
const FENCE_STATUS_PATH: DispatchStatus[] = [
  "assigned_not_dispatched",
  "dispatched",
  "in_transit",
  "delivered_pending_docs",
];
assertCanonicalSubset("FENCE_STATUS_PATH", FENCE_STATUS_PATH);

/**
 * G11 + AJK-03: advance load status from fence evidence ONLY via transitionDispatchLoadInClientTx
 * (same engine as the office route and geofence-auto-delivery). Walks legal forward edges; never
 * invents a raw UPDATE; ignores invalid_transition / status_changed silently (idempotent).
 */
async function walkLoadStatusFromFence(
  client: DbClient,
  operatingCompanyId: string,
  loadId: string,
  target: "in_transit" | "delivered_pending_docs",
  deliveredAt?: string | null
): Promise<void> {
  // LEAD 443.232 (P0) — one load's walk can never abort the caller's transaction (the positions tick writes the whole
  // fleet's GPS in it). The walk runs in its own SAVEPOINT; a failure is rolled back, audited by name and skipped.
  let failure: unknown = null;
  await withSavepoint(
    client as never,
    "fence_status_walk",
    () => walkLoadStatusFromFenceInSavepoint(client, operatingCompanyId, loadId, target, deliveredAt),
    undefined,
    (err) => { failure = err; }
  );
  if (failure) {
    const message = String((failure as Error)?.message ?? failure);
    console.warn({ err: failure, load_id: loadId, target }, "fence_status_walk_failed");
    await appendCrudAudit(
      client as never,
      GEOFENCE_AUTO_DELIVERY_ACTOR,
      "telematics.fence_status_walk_failed",
      { resource_type: "mdata.loads", resource_id: loadId, load_id: loadId, operating_company_id: operatingCompanyId, target, error: message.slice(0, 500) },
      "warning",
      "LEAD-443-232-GPS-P0"
    );
  }
}

async function walkLoadStatusFromFenceInSavepoint(
  client: DbClient,
  operatingCompanyId: string,
  loadId: string,
  target: "in_transit" | "delivered_pending_docs",
  deliveredAt?: string | null
): Promise<void> {
  const cur = await client.query<{ status: string }>(
    `SELECT status::text AS status FROM mdata.loads
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
        AND soft_deleted_at IS NULL AND voided_at IS NULL
      LIMIT 1`,
    [loadId, operatingCompanyId]
  );
  const row = cur.rows[0];
  if (!row) return;
  let status: DispatchStatus;
  try {
    status = fromMdataStatus(row.status);
  } catch {
    return;
  }
  if (
    status === "cancelled" ||
    status === "abandoned" ||
    status === "driver_walkoff" ||
    status === "driver_no_show" ||
    status === "completed_docs_received"
  ) {
    return;
  }
  const targetIdx = FENCE_STATUS_PATH.indexOf(target);
  const curIdx = FENCE_STATUS_PATH.indexOf(status);
  if (curIdx >= targetIdx && curIdx >= 0) return;
  const startIdx = curIdx >= 0 ? curIdx + 1 : 0;
  for (let i = startIdx; i <= targetIdx; i++) {
    const step = FENCE_STATUS_PATH[i]!;
    const r = await transitionDispatchLoadInClientTx(
      client as never,
      GEOFENCE_AUTO_DELIVERY_ACTOR,
      operatingCompanyId,
      loadId,
      step === "delivered_pending_docs"
        ? { new_status: step, delivered_at: deliveredAt ?? null, departure_evidence: "fence" as const }
        : { new_status: step }
    );
    if ("error" in r) return;
  }
}

type Transition = "entered" | "exited" | null;

type GeofenceContainmentRow = {
  geofence_id: string;
  vertices_json: unknown;
  last_event_kind: "entered" | "exited" | null;
};

export type GpsPointInput = {
  operating_company_id: string;
  unit_id: string;
  latitude: number;
  longitude: number;
  occurred_at: string;
  source?: "samsara_gps" | "manual";
  driver_id?: string | null;
};

export type GeofenceDetectionResult = {
  checked_geofences: number;
  transitions_written: number;
  /** Load stops this point stamped actual_arrival_at on — THE arrival count (one detector; zero forever = dead engine). */
  stop_arrivals_stamped: number;
};

/** Push sent to the driver when their load stop's fence stamps an arrival ("Arrived at stop?" — the prompt inbox reads
 *  the same fence event through STOP_ARRIVAL_EVENTS_SQL). */
export type ArrivalDriverNotifier = (input: {
  operatingCompanyId: string;
  driverId: string;
  title: string;
  body: string;
  tag: string;
  data: Record<string, string>;
}) => Promise<unknown>;

export type GeofenceDetectionOptions = {
  /** Historical replay must only rebuild immutable fence evidence. */
  suppressOperationalSideEffects?: boolean;
  notifyDriver?: ArrivalDriverNotifier;
};

export function computeGeofenceTransition(
  lastEventKind: "entered" | "exited" | null,
  isInside: boolean
): Transition {
  if (isInside && lastEventKind !== "entered") return "entered";
  if (!isInside && lastEventKind === "entered") return "exited";
  return null;
}


async function resolveDriverIdForUnit(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string
): Promise<string | null> {
  const res = await client.query<{ driver_id: string | null }>(
    `
      SELECT COALESCE(l.assigned_primary_driver_id, l.assigned_secondary_driver_id)::text AS driver_id
      FROM mdata.loads l
      WHERE l.assigned_unit_id = $2::uuid
        -- LEAD 443.238 (register B5 / C1): the unit's current load is the load service's board set (one definition), never a
        -- private NOT IN list (it let invoiced / closed / voided / abandoned / draft loads name the driver of a GPS point).
        AND ${canonicalDispatchWorkWhereClause("l", "$1::uuid")}
      -- a truck holds its next load while running the current one: the current load = the earliest pickup
      ORDER BY (SELECT min(COALESCE(s.actual_arrival_at, s.appointment_start_at, s.scheduled_arrival_at))
                  FROM mdata.load_stops s WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL) ASC NULLS LAST,
               l.created_at ASC
      LIMIT 1
    `,
    [operatingCompanyId, unitId]
  );
  return res.rows[0]?.driver_id ?? null;
}

async function fetchContainmentRows(
  client: DbClient,
  input: GpsPointInput
): Promise<GeofenceContainmentRow[]> {
  const res = await client.query<GeofenceContainmentRow>(
    `
      SELECT DISTINCT ON (g.label)
        g.id::text AS geofence_id,
        g.vertices_json,
        (
          SELECT ge.event_kind::text
          FROM geo.geofence_events ge
          WHERE ge.operating_company_id = $1::uuid
            AND ge.geofence_id = g.id
            AND ge.unit_id = $2::uuid
            AND ge.occurred_at <= $3::timestamptz
          ORDER BY ge.occurred_at DESC, ge.created_at DESC
          LIMIT 1
        )::text AS last_event_kind
      FROM geo.geofences g
      WHERE g.operating_company_id = $1::uuid
        AND g.is_active = true
      -- one evaluation per fence LABEL (oldest fence wins): a duplicated stop fence must not write two transitions
      ORDER BY g.label, g.created_at, g.id
    `,
    [input.operating_company_id, input.unit_id, input.occurred_at]
  );
  return res.rows;
}

export async function processGeofenceDetectionsForGpsPoint(
  client: DbClient,
  input: GpsPointInput,
  options: GeofenceDetectionOptions = {}
): Promise<GeofenceDetectionResult> {
  const rows = await fetchContainmentRows(client, input);
  if (rows.length === 0) {
    return { checked_geofences: 0, transitions_written: 0, stop_arrivals_stamped: 0 };
  }

  const resolvedDriverId = input.driver_id ?? (await resolveDriverIdForUnit(client, input.operating_company_id, input.unit_id));

  let transitionsWritten = 0;
  let stopArrivalsStamped = 0;
  for (const row of rows) {
    const isInside = pointInPolygon(input.latitude, input.longitude, normalizeVertices(row.vertices_json));
    const transition = computeGeofenceTransition(row.last_event_kind, isInside);
    if (!transition) continue;
    // Samsara reports a location fix and a stats fix for the same second, and they can arrive out of order: the later
    // (earlier-timestamped) one saw no prior event and wrote a second "entered". The same transition already recorded
    // for this fence + unit within 5 minutes either side of this fix is that transition, not a new one.
    // ROUND 330.7: that window check is a read before the insert, and only the exact-timestamp key is enforced — two
    // instances handling the location fix and the stats fix at once both missed each other's uncommitted "entered".
    // A transaction lock per (fence, unit) makes the second wait and then see the first's row. Fences are walked in a
    // fixed order (label, created_at, id), so two callers never take these locks in opposite orders for one unit.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [`geo.fence_transition:${row.geofence_id}:${input.unit_id}`]);
    const near = await client.query(
      `SELECT 1 FROM geo.geofence_events
        WHERE operating_company_id = $1::uuid AND geofence_id = $2::uuid AND unit_id = $3::uuid AND event_kind = $4
          AND occurred_at BETWEEN $5::timestamptz - interval '5 minutes' AND $5::timestamptz + interval '5 minutes'
        LIMIT 1`,
      [input.operating_company_id, row.geofence_id, input.unit_id, transition, input.occurred_at]
    );
    if (near.rows.length > 0) continue;
    const inserted = await client.query(
      `
        INSERT INTO geo.geofence_events (
          operating_company_id,
          geofence_id,
          unit_id,
          driver_id,
          event_kind,
          occurred_at,
          point_lat,
          point_lng,
          source
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6::timestamptz,
          $7::numeric,
          $8::numeric,
          $9
        )
        ON CONFLICT (operating_company_id, geofence_id, unit_id, event_kind, occurred_at, source) DO NOTHING
      `,
      [
        input.operating_company_id,
        row.geofence_id,
        input.unit_id,
        resolvedDriverId,
        transition,
        input.occurred_at,
        input.latitude,
        input.longitude,
        input.source ?? "samsara_gps",
      ]
    );
    if ((inserted.rowCount ?? 0) === 0) continue;
    transitionsWritten += 1;
    if (options.suppressOperationalSideEffects) continue;
    // D-1 — a bound load-stop geofence is first-class arrival/departure evidence. Persist the
    // observation on the canonical stop in the same transaction as the immutable geofence event.
    // Never overwrite driver/manual evidence and never backfill: only a newly inserted live event
    // can win the compare-and-set below. The label is minted by bindLoadToGeofences.
    const source = input.source === "manual" ? "manual" : "eld_geofence";
    // GEOFENCE-STOP-STAMP-COMPLETE (2026-10-24): RETURNING now includes stop_type and
    // current_load_status so this path can fire the same side effects as stop-stamp.service.ts
    // (load status transition, latchOnDeliveryEvidence, pingSettlementOnLoadEvent, audit).
    const stopStamp = await client.query<{
      load_id: string;
      stop_id: string;
      booked_by_user_id: string | null;
      stop_type: string;
      sequence_number: number;
      current_load_status: string;
    }>(
      transition === "entered"
        ? `
            UPDATE mdata.load_stops ls
               SET actual_arrival_at = $4::timestamptz,
                   actual_arrival_source = $5,
                   -- 443.70 S3: the fence event moves the stop, not only its time (a cancelled / departed stop keeps its state)
                   status = CASE WHEN ls.status IS NULL OR ls.status = 'pending' THEN 'arrived'::mdata.stop_status_enum ELSE ls.status END,
                   updated_at = now()
              FROM geo.geofences g, mdata.loads l
             WHERE g.id = $1::uuid
               AND g.operating_company_id = $2::uuid
               AND g.label = 'load-' || l.id::text || '-stop-' || ls.sequence_number::text
               AND l.id = ls.load_id
               AND l.operating_company_id = $2::uuid
               AND l.assigned_unit_id = $3::uuid
               AND l.soft_deleted_at IS NULL
               AND ls.soft_deleted_at IS NULL
               AND ls.actual_arrival_at IS NULL
         RETURNING ls.load_id::text AS load_id, ls.id::text AS stop_id,
                   COALESCE(l.booked_by_user_id, l.dispatcher_user_id, l.updated_by_user_id)::text AS booked_by_user_id,
                   ls.stop_type::text AS stop_type, ls.sequence_number,
                   l.status::text AS current_load_status
          `
        : `
            UPDATE mdata.load_stops ls
               SET actual_departure_at = $4::timestamptz,
                   actual_departure_source = $5,
                   status = CASE WHEN ls.status = 'cancelled' THEN ls.status ELSE 'departed'::mdata.stop_status_enum END,
                   updated_at = now()
              FROM geo.geofences g, mdata.loads l
             WHERE g.id = $1::uuid
               AND g.operating_company_id = $2::uuid
               AND g.label = 'load-' || l.id::text || '-stop-' || ls.sequence_number::text
               AND l.id = ls.load_id
               AND l.operating_company_id = $2::uuid
               AND l.assigned_unit_id = $3::uuid
               AND l.soft_deleted_at IS NULL
               AND ls.soft_deleted_at IS NULL
               AND ls.actual_departure_at IS NULL
         RETURNING ls.load_id::text AS load_id, ls.id::text AS stop_id,
                   COALESCE(l.booked_by_user_id, l.dispatcher_user_id, l.updated_by_user_id)::text AS booked_by_user_id,
                   ls.stop_type::text AS stop_type, ls.sequence_number,
                   l.status::text AS current_load_status
          `,
      [row.geofence_id, input.operating_company_id, input.unit_id, input.occurred_at, source]
    );
    const stamped = stopStamp.rows[0];
    if (transition === "entered" && stamped?.stop_id) {
      stopArrivalsStamped += 1;
      if (resolvedDriverId && options.notifyDriver) {
        await options.notifyDriver({
          operatingCompanyId: input.operating_company_id,
          driverId: resolvedDriverId,
          title: "Arrived at stop?",
          body: "You appear to be at your next stop. Confirm arrival.",
          tag: `arrival-${stamped.stop_id}`,
          data: { kind: "arrival_prompt", stop_id: stamped.stop_id, unit_id: input.unit_id },
        });
      }
      // LEAD 443.279 — an ARRIVAL never delivers the load. The final delivery stop is complete only when the truck
      // LEAVES it (actual_departure_at); delivering on arrival left 13691/13694/13696/13697 delivered with no departure, so
      // driver pay never accrued, revenue never earned, and the stop fence was retired before the exit could be seen.
    }
    // LEAD 443.279 — the FINAL active delivery stop's DEPARTURE (stamped just above, same transaction) is what delivers the
    // load: status is derived from the completed stop, never ahead of it. Only when every active delivery stop has left.
    if (transition === "exited" && stamped?.load_id && stamped.stop_type === "delivery") {
      const finalDeparted = await client.query(
        `
          SELECT 1 FROM mdata.loads l
           WHERE l.id = $1::uuid
             AND l.operating_company_id = $2::uuid
             AND l.soft_deleted_at IS NULL
             AND l.voided_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM mdata.load_stops ls2
                WHERE ls2.load_id = l.id
                  AND ls2.stop_type = 'delivery'
                  AND ls2.soft_deleted_at IS NULL
                  AND COALESCE(ls2.status::text, '') <> 'cancelled'
                  AND ls2.actual_departure_at IS NULL
             )
           LIMIT 1
        `,
        [stamped.load_id, input.operating_company_id]
      );
      if (finalDeparted.rows.length > 0) {
        await walkLoadStatusFromFence(
          client,
          input.operating_company_id,
          stamped.load_id,
          "delivered_pending_docs",
          input.occurred_at
        );
      }
    }
    // G11 + AJK-03: first pickup DEPARTURE → in_transit through the ONE transition engine.
    if (transition === "exited" && stamped?.load_id && stamped.stop_type === "pickup") {
      const firstPickup = await client.query(
        `
          SELECT 1 FROM mdata.loads l
           WHERE l.id = $1::uuid
             AND l.operating_company_id = $2::uuid
             AND l.soft_deleted_at IS NULL
             AND l.voided_at IS NULL
             AND $3::integer = (
               SELECT MIN(ls2.sequence_number) FROM mdata.load_stops ls2
                WHERE ls2.load_id = l.id AND ls2.stop_type = 'pickup' AND ls2.soft_deleted_at IS NULL
             )
           LIMIT 1
        `,
        [stamped.load_id, input.operating_company_id, stamped.sequence_number]
      );
      if (firstPickup.rows.length > 0) {
        await walkLoadStatusFromFence(client, input.operating_company_id, stamped.load_id, "in_transit");
      }
    }
    if (stamped?.load_id && stamped.stop_id && stamped.booked_by_user_id) {
      const nextLoadStatus = transition === "entered"
        ? (stamped.stop_type === "pickup" ? "at_pickup" : "at_delivery")
        : (stamped.stop_type === "delivery" ? "delivered_pending_docs" : "in_transit");
      await client.query(
        `UPDATE mdata.loads SET status = $2, updated_at = now()
           WHERE id = $1::uuid AND status::text = $3 AND operating_company_id = $4::uuid`,
        [stamped.load_id, nextLoadStatus, stamped.current_load_status, input.operating_company_id]
      );
      await mintProformaInvoiceOnFirstPickup(client, {
        operatingCompanyId: input.operating_company_id,
        loadId: stamped.load_id,
        actorUserId: stamped.booked_by_user_id,
        stopId: stamped.stop_id,
      });
      if (transition === "exited") {
        await latchOnDeliveryEvidence(client, {
          operatingCompanyId: input.operating_company_id,
          loadId: stamped.load_id,
          targetStatus: nextLoadStatus,
          actorUserId: stamped.booked_by_user_id,
        });
        try {
          await pingSettlementOnLoadEvent(client, {
            loadId: stamped.load_id,
            operatingCompanyId: input.operating_company_id,
            dispatchTargetStatus: nextLoadStatus,
            actorUserId: stamped.booked_by_user_id,
          });
        } catch (err) {
          console.warn({ err, load_id: stamped.load_id }, "geofence_stop_departure_settlement_ping_failed");
        }
      }
      await appendCrudAudit(
        client,
        stamped.booked_by_user_id,
        `load.stop.${transition === "entered" ? "arrived" : "departed"}.eld_geofence`,
        { load_id: stamped.load_id, stop_id: stamped.stop_id }
      );
    }
    await processDotDwellForGeofenceEvent(client, {
      operating_company_id: input.operating_company_id,
      geofence_id: row.geofence_id,
      unit_id: input.unit_id,
      driver_id: resolvedDriverId,
      event_kind: transition,
      occurred_at: input.occurred_at,
    });
  }

  return {
    checked_geofences: rows.length,
    transitions_written: transitionsWritten,
    stop_arrivals_stamped: stopArrivalsStamped,
  };
}
