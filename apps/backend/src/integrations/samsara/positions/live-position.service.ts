import { loadServiceDriverNameSql, loadServiceMembershipSql } from "../../../dispatch/load-service.js";
/**
 * GAP-55 — CAP-1 live GPS positions for active loads.
 */
import type { PoolClient } from "pg";

const STALE_MS = 5 * 60 * 1000;
const positionCache = new Map<string, { data: unknown; expires: number }>();

export interface LivePositionRow {
  load_uuid: string;
  unit_uuid: string;
  /** Human load number — LST-F407-B: never label the map row with a truncated uuid. */
  load_number: string | null;
  /** Human unit number — LST-F407-B. */
  unit_number: string | null;
  lat: number;
  lng: number;
  speed_mph: number | null;
  recorded_at: string;
  stale: boolean;
  /**
   * LEAD 443.235 — the load's primary driver from the ONE load-service projection
   * (assigned_primary_driver_id on the open_dispatch membership row). Never a private join.
   * `driver_id` is the board-agree field; `driver_uuid` is the harness / MapView alias (same value).
   */
  driver_id: string | null;
  driver_uuid: string | null;
  driver_name: string | null;
}

export function cacheGet<T>(key: string): T | null {
  const hit = positionCache.get(key);
  if (!hit || hit.expires < Date.now()) return null;
  return hit.data as T;
}

export function cacheSet(key: string, data: unknown, ttlMs = 30_000): void {
  positionCache.set(key, { data, expires: Date.now() + ttlMs });
}

function isStale(recordedAt: string): boolean {
  return Date.now() - new Date(recordedAt).getTime() > STALE_MS;
}

export async function getLivePositionsForActiveLoads(
  client: PoolClient,
  operatingCompanyId: string
): Promise<LivePositionRow[]> {
  const cacheKey = `active-loads:${operatingCompanyId}`;
  const cached = cacheGet<LivePositionRow[]>(cacheKey);
  if (cached) return cached;

  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

  const res = await client.query<{
    load_uuid: string;
    unit_uuid: string;
    load_number: string | null;
    unit_number: string | null;
    lat: string;
    lng: string;
    speed_mph: string | null;
    recorded_at: string;
    driver_id: string | null;
    driver_name: string | null;
  }>(
    `SELECT l.id::text AS load_uuid, u.id::text AS unit_uuid,
            l.load_number::text AS load_number, u.unit_number::text AS unit_number,
            p.lat::text, p.lng::text, p.speed_mph::text, p.recorded_at::text,
            l.assigned_primary_driver_id::text AS driver_id, ${loadServiceDriverNameSql("l", "dr")} AS driver_name
     FROM mdata.loads l
     LEFT JOIN mdata.drivers dr ON dr.id = l.assigned_primary_driver_id
     JOIN mdata.units u ON u.id = l.assigned_unit_id
                        AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
     LEFT JOIN LATERAL (
       SELECT lat, lng, speed_mph, recorded_at
       FROM integrations.samsara_vehicle_positions svp
       WHERE svp.unit_uuid = u.id AND svp.operating_company_id = l.operating_company_id
       ORDER BY recorded_at DESC LIMIT 1
     ) p ON true
     WHERE l.operating_company_id = $1::uuid
       -- LEAD 443.206R (register B6): every working truck — the load service's open_dispatch set, not in_transit only
       -- (dispatched / at_pickup / at_delivery trucks were missing from the Live Map).
       AND ${loadServiceMembershipSql("l", "open_dispatch", "$1::uuid")}
       AND l.soft_deleted_at IS NULL
       AND p.lat IS NOT NULL`,
    [operatingCompanyId]
  );

  const rows: LivePositionRow[] = res.rows.map((r) => {
    const driverId = r.driver_id ?? null;
    return {
      load_uuid: r.load_uuid,
      unit_uuid: r.unit_uuid,
      load_number: r.load_number,
      unit_number: r.unit_number,
      lat: Number(r.lat),
      lng: Number(r.lng),
      speed_mph: r.speed_mph != null ? Number(r.speed_mph) : null,
      recorded_at: r.recorded_at,
      stale: isStale(r.recorded_at),
      driver_id: driverId,
      // LEAD 443.235 — owner Chrome harness reads driver_uuid; boards read driver_id. Same value.
      driver_uuid: driverId,
      driver_name: r.driver_name ?? null,
    };
  });
  cacheSet(cacheKey, rows);
  return rows;
}

export async function getPositionForUnit(
  client: PoolClient,
  operatingCompanyId: string,
  unitUuid: string
): Promise<LivePositionRow | null> {
  const cacheKey = `unit:${operatingCompanyId}:${unitUuid}`;
  const cached = cacheGet<LivePositionRow>(cacheKey);
  if (cached) return cached;

  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
  const res = await client.query<{
    unit_uuid: string;
    lat: string;
    lng: string;
    speed_mph: string | null;
    recorded_at: string;
  }>(
    `SELECT unit_uuid::text, lat::text, lng::text, speed_mph::text, recorded_at::text
     FROM integrations.samsara_vehicle_positions
     WHERE operating_company_id = $1::uuid AND unit_uuid = $2::uuid
     ORDER BY recorded_at DESC LIMIT 1`,
    [operatingCompanyId, unitUuid]
  );
  const r = res.rows[0];
  if (!r) return null;
  const row: LivePositionRow = {
    load_uuid: "",
    unit_uuid: r.unit_uuid,
    load_number: null,
    unit_number: null,
    driver_id: null,
    driver_uuid: null,
    driver_name: null,
    lat: Number(r.lat),
    lng: Number(r.lng),
    speed_mph: r.speed_mph != null ? Number(r.speed_mph) : null,
    recorded_at: r.recorded_at,
    stale: isStale(r.recorded_at),
  };
  cacheSet(cacheKey, row);
  return row;
}
