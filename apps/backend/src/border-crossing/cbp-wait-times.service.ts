import { randomUUID } from "node:crypto";
import type pg from "pg";

const CBP_WAIT_TIMES_URL = "https://bwt.cbp.gov/api/waittimes";
const CACHE_TTL_MS = 5 * 60 * 1000;

type CbpApiPort = {
  port_number?: string;
  port_name?: string;
  lanes?: Array<{
    lane_type?: string;
    wait_time?: number | string | null;
    lanes_open?: number | string | null;
  }>;
};

export type CbpWaitTimeRow = {
  cbp_port_code: string;
  lane_type: string;
  wait_time_minutes: number | null;
  lanes_open: number | null;
  fetched_at: string;
};

function normalizeLaneType(raw: string | undefined): string {
  const value = (raw ?? "standard").toLowerCase();
  if (value.includes("fast") || value.includes("sentri") || value.includes("ready")) return "fast";
  if (value.includes("commercial") || value.includes("truck")) return "commercial";
  if (value.includes("passenger") || value.includes("auto")) return "passenger";
  if (value.includes("pedestrian")) return "pedestrian";
  return "standard";
}

function parseMinutes(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function fetchCbpWaitTimesFromApi(cbpPortCode?: string): Promise<CbpWaitTimeRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(CBP_WAIT_TIMES_URL, { signal: controller.signal });
    if (!res.ok) return [];
    const payload = (await res.json()) as CbpApiPort[] | { ports?: CbpApiPort[] };
    const ports = Array.isArray(payload) ? payload : (payload.ports ?? []);
    const fetchedAt = new Date().toISOString();
    const rows: CbpWaitTimeRow[] = [];

    for (const port of ports) {
      const code = String(port.port_number ?? "").trim();
      if (cbpPortCode && code !== cbpPortCode) continue;
      for (const lane of port.lanes ?? []) {
        rows.push({
          cbp_port_code: code || cbpPortCode || "unknown",
          lane_type: normalizeLaneType(lane.lane_type),
          wait_time_minutes: parseMinutes(lane.wait_time),
          lanes_open: parseMinutes(lane.lanes_open),
          fetched_at: fetchedAt,
        });
      }
    }

    if (rows.length === 0 && cbpPortCode) {
      rows.push({
        cbp_port_code: cbpPortCode,
        lane_type: "commercial",
        wait_time_minutes: null,
        lanes_open: null,
        fetched_at: fetchedAt,
      });
    }
    return rows;
  } catch {
    return cbpPortCode
      ? [
          {
            cbp_port_code: cbpPortCode,
            lane_type: "commercial",
            wait_time_minutes: null,
            lanes_open: null,
            fetched_at: new Date().toISOString(),
          },
        ]
      : [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCachedCbpWaitTimes(
  client: pg.PoolClient,
  cbpPortCode: string
): Promise<{ rows: CbpWaitTimeRow[]; stale: boolean; source: "cache" | "live" }> {
  const cached = await client.query(
    `
      SELECT cbp_port_code, lane_type, wait_time_minutes, lanes_open, fetched_at::text
      FROM reference.cbp_wait_times_cache
      WHERE cbp_port_code = $1
        AND fetched_at >= NOW() - INTERVAL '5 minutes'
      ORDER BY fetched_at DESC, lane_type
    `,
    [cbpPortCode]
  );

  if (cached.rows.length > 0) {
    return { rows: cached.rows as CbpWaitTimeRow[], stale: false, source: "cache" };
  }

  const live = await fetchCbpWaitTimesFromApi(cbpPortCode);
  if (live.length > 0) {
    await cacheCbpWaitTimes(client, live);
  }
  return { rows: live, stale: live.some((r) => r.wait_time_minutes == null), source: "live" };
}

export async function cacheCbpWaitTimes(client: pg.PoolClient, rows: CbpWaitTimeRow[]) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO reference.cbp_wait_times_cache (id, cbp_port_code, lane_type, wait_time_minutes, lanes_open, fetched_at)
        VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))
      `,
      [randomUUID(), row.cbp_port_code, row.lane_type, row.wait_time_minutes, row.lanes_open, row.fetched_at]
    );
  }
}

export async function refreshAllActivePortWaitTimes(client: pg.PoolClient) {
  const ports = await client.query(
    `SELECT DISTINCT cbp_port_code FROM reference.ports_of_entry WHERE active = true AND cbp_port_code IS NOT NULL`
  );
  for (const port of ports.rows as Array<{ cbp_port_code: string }>) {
    const rows = await fetchCbpWaitTimesFromApi(port.cbp_port_code);
    if (rows.length > 0) await cacheCbpWaitTimes(client, rows);
  }
}

export { CACHE_TTL_MS };
