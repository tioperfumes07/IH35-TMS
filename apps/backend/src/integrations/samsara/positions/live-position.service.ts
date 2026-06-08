/**
 * GAP-55 — CAP-1 live GPS positions for active loads.
 */
import type { PoolClient } from "pg";

const STALE_MS = 5 * 60 * 1000;
const positionCache = new Map<string, { data: unknown; expires: number }>();

export interface LivePositionRow {
  load_uuid: string;
  unit_uuid: string;
  lat: number;
  lng: number;
  speed_mph: number | null;
  recorded_at: string;
  stale: boolean;
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

  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const res = await client.query<{
    load_uuid: string;
    unit_uuid: string;
    lat: string;
    lng: string;
    speed_mph: string | null;
    recorded_at: string;
  }>(
    `SELECT l.id::text AS load_uuid, u.id::text AS unit_uuid,
            p.lat::text, p.lng::text, p.speed_mph::text, p.recorded_at::text
     FROM mdata.loads l
     JOIN mdata.units u ON u.id = l.assigned_unit_id
     LEFT JOIN LATERAL (
       SELECT lat, lng, speed_mph, recorded_at
       FROM integrations.samsara_vehicle_positions svp
       WHERE svp.unit_uuid = u.id AND svp.operating_company_id = l.operating_company_id
       ORDER BY recorded_at DESC LIMIT 1
     ) p ON true
     WHERE l.operating_company_id = $1::uuid
       AND l.status::text = 'in_transit'
       AND l.soft_deleted_at IS NULL
       AND p.lat IS NOT NULL`,
    [operatingCompanyId]
  );

  const rows: LivePositionRow[] = res.rows.map((r) => ({
    load_uuid: r.load_uuid,
    unit_uuid: r.unit_uuid,
    lat: Number(r.lat),
    lng: Number(r.lng),
    speed_mph: r.speed_mph != null ? Number(r.speed_mph) : null,
    recorded_at: r.recorded_at,
    stale: isStale(r.recorded_at),
  }));
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

  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
    lat: Number(r.lat),
    lng: Number(r.lng),
    speed_mph: r.speed_mph != null ? Number(r.speed_mph) : null,
    recorded_at: r.recorded_at,
    stale: isStale(r.recorded_at),
  };
  cacheSet(cacheKey, row);
  return row;
}
