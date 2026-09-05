import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";
import { SamsaraClient } from "./samsara-client.js";

export type RouteDbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

function encryptedToken(row: Record<string, unknown>): Buffer | null {
  const value = row.encrypted_api_token ?? row.api_token_encrypted;
  return Buffer.isBuffer(value) && value.length ? value : null;
}

export async function listLeaseScopedDispatchedRoutes(client: RouteDbClient, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
  const result = await client.query<{
    load_id: string; load_number: string; unit_id: string; driver_id: string | null; stops: unknown;
  }>(
    `SELECT l.id::text AS load_id, l.load_number, l.assigned_unit_id::text AS unit_id,
            l.assigned_primary_driver_id::text AS driver_id,
            jsonb_agg(jsonb_build_object(
              'stop_id', ls.id, 'sequence', ls.sequence_number, 'address_id', 'ih35Stop:' || ls.id::text,
              'scheduled_arrival_at', ls.scheduled_arrival_at, 'scheduled_departure_at', ls.scheduled_departure_at,
              'notes', ls.notes
            ) ORDER BY ls.sequence_number) AS stops
       FROM mdata.loads l
       JOIN mdata.units u ON u.id = l.assigned_unit_id
        AND u.currently_leased_to_company_id = $1::uuid
       JOIN mdata.load_stops ls ON ls.load_id = l.id AND ls.soft_deleted_at IS NULL
      WHERE l.operating_company_id = $1::uuid
        AND l.status::text IN ('dispatched','at_pickup','in_transit','at_delivery')
        AND l.soft_deleted_at IS NULL
      GROUP BY l.id, l.load_number, l.assigned_unit_id, l.assigned_primary_driver_id
     HAVING COUNT(*) >= 2
      ORDER BY l.load_number`,
    [operatingCompanyId]
  );
  return result.rows;
}

export async function pushLeaseScopedDispatchedRoute(client: RouteDbClient, operatingCompanyId: string, loadId: string) {
  const eligible = await listLeaseScopedDispatchedRoutes(client, operatingCompanyId);
  const route = eligible.find((row) => row.load_id === loadId);
  if (!route) throw new Error("samsara_route_load_not_eligible_or_not_lease_scoped");
  const config = await client.query<Record<string, unknown>>(
    `SELECT encrypted_api_token, api_token_encrypted, samsara_org_id
       FROM integrations.samsara_config
      WHERE operating_company_id = $1::uuid AND is_enabled = true LIMIT 1`,
    [operatingCompanyId]
  );
  const cfg = config.rows[0];
  const token = cfg ? encryptedToken(cfg) : null;
  if (!cfg || !token) throw new Error("samsara_not_configured");
  const stops = Array.isArray(route.stops) ? route.stops as Array<Record<string, unknown>> : [];
  return new SamsaraClient({ apiToken: decryptSamsaraSecret(token), samsaraOrgId: String(cfg.samsara_org_id ?? "") || null }).upsertRoute({
    loadId: route.load_id,
    name: route.load_number,
    unitId: route.unit_id,
    driverId: route.driver_id,
    stops: stops.map((stop) => ({
      externalIds: { ih35Load: route.load_id, ih35Stop: String(stop.stop_id) },
      addressId: String(stop.address_id),
      scheduledArrivalTime: stop.scheduled_arrival_at ? new Date(String(stop.scheduled_arrival_at)).toISOString() : undefined,
      scheduledDepartureTime: stop.scheduled_departure_at ? new Date(String(stop.scheduled_departure_at)).toISOString() : undefined,
      notes: stop.notes ? String(stop.notes) : undefined,
    })),
  });
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
