/**
 * GAP-39 — Geofence state watcher (every 5min).
 */

import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { fetchActiveGeofences, processGpsBatch } from "../integrations/samsara/geofences/state-machine/transitions.service.js";

const WORKER_NAME = "integrations.geofence_state_watcher";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

function intervalMs(): number {
  const raw = Number(process.env.GEOFENCE_STATE_WATCHER_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function fetchCompanies(client: DbClient): Promise<string[]> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text FROM org.companies WHERE deactivated_at IS NULL`
  );
  return res.rows.map((r) => r.id);
}

async function fetchLatestPositions(client: DbClient, operatingCompanyId: string) {
  const res = await client.query<{
    unit_id: string;
    lat: number;
    lng: number;
  }>(
    `
      SELECT DISTINCT ON (v.unit_id)
        v.unit_id::text,
        v.lat::double precision AS lat,
        v.lng::double precision AS lng
      FROM telematics.vehicle_locations v
      WHERE v.operating_company_id = $1::uuid
      ORDER BY v.unit_id, v.captured_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows.map((r) => ({
    vehicle_id: r.unit_id,
    position: { lat: r.lat, lng: r.lng },
  }));
}

async function tick(app: FastifyInstance) {
  let total = 0;
  await withLuciaBypass(async (client) => {
    const companies = await fetchCompanies(client as DbClient);
    for (const companyId of companies) {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
      const geofences = await fetchActiveGeofences(client as DbClient, companyId);
      const positions = await fetchLatestPositions(client as DbClient, companyId);
      if (geofences.length === 0 || positions.length === 0) continue;
      const results = await processGpsBatch(client as DbClient, companyId, positions, geofences);
      total += results.length;
    }
  });
  app.log.info({ transitions: total }, `[${WORKER_NAME}] tick complete`);
}

export function initializeGeofenceStateWatcher(app: FastifyInstance) {
  const ms = intervalMs();
  const run = async () => {
    try {
      await tick(app);
    } catch (err) {
      app.log.error({ err }, `[${WORKER_NAME}] tick failed`);
    }
  };
  void run();
  timer = setInterval(() => void run(), ms);
  app.log.info({ intervalMs: ms }, `[${WORKER_NAME}] started`);
}

export function stopGeofenceStateWatcher() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
