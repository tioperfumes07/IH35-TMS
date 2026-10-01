import { canonicalDispatchWorkStatusClause } from "../../dispatch/canonical-active-load-set.js";
import { stopFenceTimeSql } from "../../telematics/stop-arrival-events.js";
import { resolveSamsaraApiToken } from "./samsara-token.js";
import { SamsaraClient } from "./samsara-client.js";
import { createHash } from "node:crypto";
import { loadSamsaraVehicleIdsByUnit } from "./fuel-purchase-push.service.js";
import type { SamsaraRouteStopInput } from "./samsara-client.js";

export type RouteDbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

function encryptedToken(row: Record<string, unknown>): Buffer | null {
  const value = row.encrypted_api_token ?? row.api_token_encrypted;
  return Buffer.isBuffer(value) && value.length ? value : null;
}

/**
 * ROUND 306 E-31 — push each dispatched load to Samsara as a Route, keyed to our ids
 * (externalIds ih35Load / ih35Stop), so Samsara runs arrival/departure, ETA and leg miles.
 *
 * Measured live 2026-10-01 before rewriting (rejected probes only, nothing created):
 *  - the old body sent vehicleId `ih35Unit:<uuid>`, driverId `ih35Driver:<uuid>`, addressId `ih35Stop:<uuid>`.
 *    Samsara has none of those external ids (0 of 934 fences are linked to a Samsara address) -> every
 *    push would have been rejected. Now: Samsara's own vehicle id (mirror-first, ambiguous -> skip) and
 *    driver id (exactly one link, else omitted with a note), and each stop as
 *    singleUseLocation {address, latitude, longitude} from the stop's own coordinates (33/33 dispatched
 *    USMCA stops carry lat/lng). A stop without coordinates -> the load is skipped, never placed.
 *  - scope was `currently_leased_to_company_id = $1` only, dropping USMCA-owned unleased trucks ->
 *    now COALESCE(currently_leased_to_company_id, owner_company_id), the operator rule used fleet-wide.
 * Writes to Samsara only when SAMSARA_ROUTES_PUSH_ENABLED=true (default OFF). A load is re-sent only
 * when its body hash changed (ledger: integrations.integration_sync_log sync_kind 'route_push').
 */

export const ROUTE_PUSH_SYNC_KIND = "route_push";
export const ROUTE_ON_ROAD_STATUSES = ["dispatched", "at_pickup", "in_transit", "at_delivery"] as const;

export function samsaraRoutesPushEnabled(): boolean {
  return process.env.SAMSARA_ROUTES_PUSH_ENABLED === "true";
}

type EligibleRouteRow = {
  load_id: string; load_number: string; unit_id: string; driver_id: string | null; stops: unknown;
};

export async function listLeaseScopedDispatchedRoutes(client: RouteDbClient, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
  const result = await client.query<EligibleRouteRow>(
    `SELECT l.id::text AS load_id, l.load_number, l.assigned_unit_id::text AS unit_id,
            l.assigned_primary_driver_id::text AS driver_id,
            jsonb_agg(jsonb_build_object(
              'stop_id', ls.id, 'sequence', ls.sequence_number, 'stop_type', ls.stop_type,
              'latitude', ls.latitude, 'longitude', ls.longitude,
              'address', concat_ws(', ', NULLIF(ls.address_line1, ''), NULLIF(ls.city, ''), NULLIF(ls.state, ''), NULLIF(ls.postal_code, '')),
              'scheduled_arrival_at', ls.scheduled_arrival_at, 'scheduled_departure_at', ls.scheduled_departure_at,
              'notes', ls.notes
            ) ORDER BY ls.sequence_number) AS stops
       FROM mdata.loads l
       JOIN mdata.units u ON u.id = l.assigned_unit_id
        AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
       JOIN mdata.load_stops ls ON ls.load_id = l.id AND ls.soft_deleted_at IS NULL
      WHERE l.operating_company_id = $1::uuid
        AND l.status::text = ANY($2::text[])
        AND l.soft_deleted_at IS NULL
        -- a load the truck already delivered gets no route (status lags the evidence until auto-status is on):
        -- the last delivery stop is stamped, or the unit entered that stop's Samsara fence
        AND NOT EXISTS (
          SELECT 1 FROM mdata.load_stops d
           WHERE d.load_id = l.id AND d.stop_type::text = 'delivery' AND d.soft_deleted_at IS NULL
             AND d.sequence_number = (SELECT max(x.sequence_number) FROM mdata.load_stops x
                                       WHERE x.load_id = l.id AND x.stop_type::text = 'delivery' AND x.soft_deleted_at IS NULL)
             AND (d.actual_arrival_at IS NOT NULL
                  OR ${stopFenceTimeSql("l.id", "d.sequence_number", "l.assigned_unit_id", "entered")} IS NOT NULL))
      GROUP BY l.id, l.load_number, l.assigned_unit_id, l.assigned_primary_driver_id
     HAVING COUNT(*) >= 2
      ORDER BY l.load_number`,
    [operatingCompanyId, [...ROUTE_ON_ROAD_STATUSES]]
  );
  return result.rows;
}

/** Local driver -> Samsara driver ids from the CANONICAL map (merges followed), most recent login first. */
async function loadSamsaraDriverIdsByDriver(client: RouteDbClient, operatingCompanyId: string): Promise<Map<string, Set<string>>> {
  const res = await client.query<{ driver_id: string; sid: string }>(
    `SELECT COALESCE(d.merged_into_driver_id, d.id)::text AS driver_id, a.samsara_driver_id::text AS sid
       FROM mdata.driver_samsara_accounts a JOIN mdata.drivers d ON d.id = a.driver_id
      WHERE a.operating_company_id = $1::uuid AND a.is_active
      ORDER BY a.last_login_at DESC NULLS LAST`,
    [operatingCompanyId]
  );
  const out = new Map<string, Set<string>>();
  for (const r of res.rows) {
    const set = out.get(r.driver_id) ?? new Set<string>();
    set.add(r.sid);
    out.set(r.driver_id, set);
  }
  return out;
}

export type RoutePlanItem =
  | {
      load_id: string; load_number: string; action: "push";
      body: { loadId: string; name: string; unitId: string; driverId: string | null; samsaraVehicleId: string; samsaraDriverId: string | null; stops: SamsaraRouteStopInput[] };
      driver_note: string | null; body_hash: string;
    }
  | { load_id: string; load_number: string; action: "skip"; reason: "no_samsara_vehicle" | "ambiguous_samsara_vehicle" | "stop_without_coordinates" };

/** Pure. */
export function planRoutePushes(rows: EligibleRouteRow[], vehicles: Map<string, string[]>, drivers: Map<string, Set<string>>): RoutePlanItem[] {
  return rows.map((r): RoutePlanItem => {
    const vids = vehicles.get(r.unit_id) ?? [];
    if (vids.length === 0) return { load_id: r.load_id, load_number: r.load_number, action: "skip", reason: "no_samsara_vehicle" };
    if (vids.length > 1) return { load_id: r.load_id, load_number: r.load_number, action: "skip", reason: "ambiguous_samsara_vehicle" };
    const stops = Array.isArray(r.stops) ? (r.stops as Array<Record<string, unknown>>) : [];
    const built: SamsaraRouteStopInput[] = [];
    for (const st of stops) {
      const lat = st.latitude == null ? NaN : Number(st.latitude);
      const lng = st.longitude == null ? NaN : Number(st.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { load_id: r.load_id, load_number: r.load_number, action: "skip", reason: "stop_without_coordinates" };
      built.push({
        // stop ids only: the route already carries ih35Load, and Samsara refuses the same external id value twice
        // in one route ("Duplicate external id value already exists", probed 2026-10-01)
        externalIds: { ih35Stop: String(st.stop_id) },
        singleUseLocation: { address: String(st.address || `${lat},${lng}`), latitude: lat, longitude: lng },
        scheduledArrivalTime: st.scheduled_arrival_at ? new Date(String(st.scheduled_arrival_at)).toISOString() : undefined,
        scheduledDepartureTime: st.scheduled_departure_at ? new Date(String(st.scheduled_departure_at)).toISOString() : undefined,
        notes: st.notes ? String(st.notes) : undefined,
      });
    }
    const sids = r.driver_id ? [...(drivers.get(r.driver_id) ?? [])] : [];
    // A route takes one Samsara driver: the driver's most recently logged-in account (canonical map order).
    const samsaraDriverId = sids[0] ?? null;
    const driver_note = !r.driver_id ? "load has no primary driver" : sids.length === 0 ? "driver not linked to Samsara" : sids.length > 1 ? `driver holds ${sids.length} Samsara accounts — most recent login used` : null;
    const body = { loadId: r.load_id, name: r.load_number, unitId: r.unit_id, driverId: r.driver_id, samsaraVehicleId: vids[0]!, samsaraDriverId, stops: built };
    const body_hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    return { load_id: r.load_id, load_number: r.load_number, action: "push", body, driver_note, body_hash };
  });
}

export async function buildRoutePushPlan(client: RouteDbClient, operatingCompanyId: string): Promise<RoutePlanItem[]> {
  const rows = await listLeaseScopedDispatchedRoutes(client, operatingCompanyId);
  const vehicles = await loadSamsaraVehicleIdsByUnit(client as never, operatingCompanyId);
  const drivers = await loadSamsaraDriverIdsByDriver(client, operatingCompanyId);
  return planRoutePushes(rows, vehicles, drivers);
}

async function lastPushedHash(client: RouteDbClient, operatingCompanyId: string, loadId: string): Promise<string | null> {
  const r = await client.query<{ h: string | null }>(
    `SELECT payload->>'body_hash' AS h FROM integrations.integration_sync_log
      WHERE operating_company_id = $1::uuid AND integration = 'samsara' AND sync_kind = $2
        AND payload->>'load_id' = $3 AND payload->>'outcome' = 'pushed'
      ORDER BY started_at DESC LIMIT 1`,
    [operatingCompanyId, ROUTE_PUSH_SYNC_KIND, loadId]
  );
  return r.rows[0]?.h ?? null;
}

async function recordRoutePush(client: RouteDbClient, operatingCompanyId: string, payload: Record<string, unknown>, ok: boolean, error: string | null) {
  await client.query(
    `INSERT INTO integrations.integration_sync_log
       (operating_company_id, integration, sync_kind, started_at, finished_at, success, rows_added, rows_updated, rows_removed, error_message, payload)
     VALUES ($1::uuid, 'samsara', $2, now(), now(), $3, $4, 0, 0, $5, $6::jsonb)`,
    [operatingCompanyId, ROUTE_PUSH_SYNC_KIND, ok, ok ? 1 : 0, error, JSON.stringify(payload)]
  );
}

export async function pushRoutePlanItem(
  client: RouteDbClient,
  operatingCompanyId: string,
  item: Extract<RoutePlanItem, { action: "push" }>,
  api: { upsertRoute: (b: Extract<RoutePlanItem, { action: "push" }>["body"]) => Promise<{ id: string; created: boolean }> }
): Promise<{ load_id: string; outcome: "pushed" | "unchanged" | "failed"; samsara_route_id?: string; error?: string }> {
  if ((await lastPushedHash(client, operatingCompanyId, item.load_id)) === item.body_hash) return { load_id: item.load_id, outcome: "unchanged" };
  try {
    const r = await api.upsertRoute(item.body);
    await recordRoutePush(client, operatingCompanyId, { load_id: item.load_id, outcome: "pushed", body_hash: item.body_hash, samsara_route_id: r.id, created: r.created, driver_note: item.driver_note }, true, null);
    // E-31: the route id is stamped on the load (forward link); the route's externalIds.ih35Load is the reverse.
    await client.query(
      `UPDATE mdata.loads SET samsara_route_id = $3 WHERE id = $1::uuid AND operating_company_id = $2::uuid
          AND samsara_route_id IS DISTINCT FROM $3`,
      [item.load_id, operatingCompanyId, r.id]
    );
    return { load_id: item.load_id, outcome: "pushed", samsara_route_id: r.id };
  } catch (error) {
    // Keep Samsara's own reason (SamsaraApiError.body.message) -- "samsara_http_400" alone hid the cause for 64 runs.
    const samsaraReason = (error as { body?: { message?: unknown } })?.body?.message;
    const message = String((error as Error)?.message ?? error) + (samsaraReason ? `: ${String(samsaraReason)}` : "");
    await recordRoutePush(client, operatingCompanyId, { load_id: item.load_id, outcome: "failed", body_hash: item.body_hash }, false, message);
    return { load_id: item.load_id, outcome: "failed", error: message };
  }
}

export async function samsaraRouteApiFor(client: RouteDbClient, operatingCompanyId: string): Promise<SamsaraClient> {
  return samsaraClientFor(client, operatingCompanyId);
}

async function samsaraClientFor(client: RouteDbClient, operatingCompanyId: string): Promise<SamsaraClient> {
  const config = await client.query<Record<string, unknown>>(
    `SELECT encrypted_api_token, api_token_encrypted, samsara_org_id
       FROM integrations.samsara_config
      WHERE operating_company_id = $1::uuid AND is_enabled = true LIMIT 1`,
    [operatingCompanyId]
  );
  const cfg = config.rows[0];
  if (!cfg) throw new Error("samsara_not_configured");
  return new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg), samsaraOrgId: String(cfg.samsara_org_id ?? "") || null });
}

export async function pushLeaseScopedDispatchedRoute(client: RouteDbClient, operatingCompanyId: string, loadId: string) {
  if (!samsaraRoutesPushEnabled()) throw new Error("samsara_routes_push_disabled (SAMSARA_ROUTES_PUSH_ENABLED is not true)");
  const plan = await buildRoutePushPlan(client, operatingCompanyId);
  const item = plan.find((p) => p.load_id === loadId);
  if (!item) throw new Error("samsara_route_load_not_eligible_or_not_in_entity");
  if (item.action === "skip") throw new Error(`samsara_route_skipped:${item.reason}`);
  return pushRoutePlanItem(client, operatingCompanyId, item, await samsaraClientFor(client, operatingCompanyId));
}

/** Cron body: every eligible load whose body changed since its last successful push. */
export async function pushAllChangedRoutes(client: RouteDbClient, operatingCompanyId: string) {
  const plan = await buildRoutePushPlan(client, operatingCompanyId);
  const api = await samsaraClientFor(client, operatingCompanyId);
  const results = [];
  for (const item of plan) {
    if (item.action === "skip") continue;
    results.push(await pushRoutePlanItem(client, operatingCompanyId, item, api));
  }
  return { planned: plan.length, skipped: plan.filter((p) => p.action === "skip").length, results };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function projectRouteStopEvent(client: RouteDbClient, input: {
  operatingCompanyId: string; eventType: string; payload: Record<string, unknown>;
}): Promise<{ success: true } | { success: false; error: string }> {
  const data = object(input.payload.data);
  const route = object(data?.route);
  const stop = object(data?.routeStopDetails);
  const routeIds = object(route?.externalIds);
  const stopIds = object(stop?.externalIds);
  const loadId = typeof routeIds?.ih35Load === "string" ? routeIds.ih35Load : null;
  const stopId = typeof stopIds?.ih35Stop === "string" ? stopIds.ih35Stop : null;
  const occurredAt = typeof data?.time === "string" ? data.time : typeof input.payload.eventTime === "string" ? input.payload.eventTime : null;
  if (!loadId || !stopId || !occurredAt) return { success: false, error: "route_stop_external_ids_or_time_missing" };
  const arrival = input.eventType.toLowerCase() === "routestoparrival";
  const departure = input.eventType.toLowerCase() === "routestopdeparture";
  if (!arrival && !departure) return { success: false, error: "route_stop_event_type_unsupported" };
  const update = await client.query<{ id: string }>(
    `UPDATE mdata.load_stops ls
        SET actual_arrival_at = CASE WHEN $4 THEN COALESCE(ls.actual_arrival_at, $5::timestamptz) ELSE ls.actual_arrival_at END,
            actual_arrival_source = CASE WHEN $4 THEN COALESCE(ls.actual_arrival_source, 'samsara_route') ELSE ls.actual_arrival_source END,
            actual_departure_at = CASE WHEN $6 THEN COALESCE(ls.actual_departure_at, $5::timestamptz) ELSE ls.actual_departure_at END,
            actual_departure_source = CASE WHEN $6 THEN COALESCE(ls.actual_departure_source, 'samsara_route') ELSE ls.actual_departure_source END,
            status = CASE WHEN $6 THEN 'departed'::mdata.stop_status_enum WHEN $4 THEN 'arrived'::mdata.stop_status_enum ELSE ls.status END,
            updated_at = now()
       FROM mdata.loads l
      WHERE ls.id = $3::uuid AND ls.load_id = l.id
        AND l.id = $2::uuid AND l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL AND ls.soft_deleted_at IS NULL
      RETURNING ls.id::text`,
    [input.operatingCompanyId, loadId, stopId, arrival, occurredAt, departure]
  );
  return update.rows[0] ? { success: true } : { success: false, error: "route_stop_not_found_in_company" };
}


/**
 * E-31 read-back: every load carrying a Samsara route id that is still in dispatch work (or moved in the last 2
 * days) -> GET the route -> one integrations.samsara_route_stop_progress row per stop (matched by the stop's
 * externalIds.ih35Stop): Samsara state, ETA, actual arrival / departure, en-route / skipped times, planned
 * distance, live-share URL. Evidence only -- arrivals of record stay geo.geofence_events.
 */
export async function readBackSamsaraRoutes(
  client: RouteDbClient,
  operatingCompanyId: string,
  api: { getRoute: (id: string) => Promise<Record<string, unknown> | null> }
) {
  const loads = await client.query<{ load_id: string; route_id: string; unit_id: string | null }>(
    `SELECT l.id::text AS load_id, l.samsara_route_id AS route_id, l.assigned_unit_id::text AS unit_id
       FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid AND l.samsara_route_id IS NOT NULL AND l.soft_deleted_at IS NULL
        AND (${canonicalDispatchWorkStatusClause("l")} OR l.updated_at > now() - interval '2 days')`,
    [operatingCompanyId]
  );
  const ts = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
  let routes = 0, stops = 0, missing = 0;
  for (const l of loads.rows) {
    const route = await api.getRoute(l.route_id);
    if (!route) { missing += 1; continue; }
    routes += 1;
    for (const raw of Array.isArray(route.stops) ? (route.stops as Array<Record<string, unknown>>) : []) {
      const stopId = typeof object(raw.externalIds)?.ih35Stop === "string" ? String(object(raw.externalIds)!.ih35Stop) : null;
      if (!stopId || raw.id == null) continue;
      const res = await client.query(
        `INSERT INTO integrations.samsara_route_stop_progress
           (operating_company_id, load_id, stop_id, unit_id, samsara_route_id, samsara_stop_id, sequence_number, state, eta,
            actual_arrival_at, actual_departure_at, en_route_at, skipped_at, planned_distance_meters, live_sharing_url, read_at)
         SELECT $1::uuid, $2::uuid, s.id, $4::uuid, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz,
                $12::timestamptz, $13::timestamptz, $14::numeric, $15, now()
           FROM mdata.load_stops s WHERE s.id = $3::uuid AND s.load_id = $2::uuid
         ON CONFLICT (load_id, stop_id) DO UPDATE SET
           unit_id = EXCLUDED.unit_id, samsara_route_id = EXCLUDED.samsara_route_id, samsara_stop_id = EXCLUDED.samsara_stop_id,
           sequence_number = EXCLUDED.sequence_number, state = EXCLUDED.state, eta = EXCLUDED.eta,
           actual_arrival_at = EXCLUDED.actual_arrival_at, actual_departure_at = EXCLUDED.actual_departure_at,
           en_route_at = EXCLUDED.en_route_at, skipped_at = EXCLUDED.skipped_at,
           planned_distance_meters = EXCLUDED.planned_distance_meters, live_sharing_url = EXCLUDED.live_sharing_url,
           read_at = now(), updated_at = now()
         RETURNING load_id`,
        [operatingCompanyId, l.load_id, stopId, l.unit_id, l.route_id, String(raw.id), Number(raw.sequenceNumber ?? 0),
         typeof raw.state === "string" ? raw.state : null, ts(raw.eta), ts(raw.actualArrivalTime), ts(raw.actualDepartureTime),
         ts(raw.enRouteTime), ts(raw.skippedTime), raw.plannedDistanceMeters == null ? null : Number(raw.plannedDistanceMeters),
         typeof raw.liveSharingUrl === "string" ? raw.liveSharingUrl : null]
      );
      stops += res.rows.length;
    }
  }
  return { loads_with_route: loads.rows.length, routes_read: routes, routes_missing: missing, stops_upserted: stops };
}
