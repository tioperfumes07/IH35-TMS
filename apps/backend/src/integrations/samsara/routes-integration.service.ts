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
      GROUP BY l.id, l.load_number, l.assigned_unit_id, l.assigned_primary_driver_id
     HAVING COUNT(*) >= 2
      ORDER BY l.load_number`,
    [operatingCompanyId, [...ROUTE_ON_ROAD_STATUSES]]
  );
  return result.rows;
}

/** Local driver -> Samsara driver ids (mdata.drivers column + mirror). */
async function loadSamsaraDriverIdsByDriver(client: RouteDbClient, operatingCompanyId: string): Promise<Map<string, Set<string>>> {
  const res = await client.query<{ driver_id: string; sid: string }>(
    `SELECT d.id::text AS driver_id, d.samsara_driver_id::text AS sid FROM mdata.drivers d
      WHERE d.operating_company_id = $1::uuid AND d.samsara_driver_id IS NOT NULL
     UNION
     SELECT sd.local_driver_id::text, sd.samsara_driver_id::text FROM integrations.samsara_drivers sd
      WHERE sd.operating_company_id = $1::uuid AND sd.local_driver_id IS NOT NULL`,
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
        externalIds: { ih35Load: r.load_id, ih35Stop: String(st.stop_id) },
        singleUseLocation: { address: String(st.address || `${lat},${lng}`), latitude: lat, longitude: lng },
        scheduledArrivalTime: st.scheduled_arrival_at ? new Date(String(st.scheduled_arrival_at)).toISOString() : undefined,
        scheduledDepartureTime: st.scheduled_departure_at ? new Date(String(st.scheduled_departure_at)).toISOString() : undefined,
        notes: st.notes ? String(st.notes) : undefined,
      });
    }
    const sids = r.driver_id ? [...(drivers.get(r.driver_id) ?? [])] : [];
    const samsaraDriverId = sids.length === 1 ? sids[0]! : null;
    const driver_note = !r.driver_id ? "load has no primary driver" : sids.length === 0 ? "driver not linked to Samsara" : sids.length > 1 ? `driver linked to ${sids.length} Samsara ids — omitted` : null;
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
    return { load_id: item.load_id, outcome: "pushed", samsara_route_id: r.id };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    await recordRoutePush(client, operatingCompanyId, { load_id: item.load_id, outcome: "failed", body_hash: item.body_hash }, false, message);
    return { load_id: item.load_id, outcome: "failed", error: message };
  }
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
