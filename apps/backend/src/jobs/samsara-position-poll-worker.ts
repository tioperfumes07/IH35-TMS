/**
 * GAP-55 — Poll Samsara fleet locations every 30s, UPSERT positions cache.
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";

const WORKER_NAME = "integrations.samsara_position_poll";
const INTERVAL_MS = 30_000;
let timer: NodeJS.Timeout | undefined;
let running = false;

export async function pollSamsaraPositions(app: FastifyInstance): Promise<void> {
  if (running) return;
  running = true;
  try {
    await withLuciaBypass(async (client) => {
      const units = await client.query<{
        unit_uuid: string;
        operating_company_id: string;
        samsara_vehicle_id: string | null;
        lat: number | null;
        lng: number | null;
        speed_mph: number | null;
      }>(
        `SELECT u.id::text AS unit_uuid, u.owner_company_id::text AS operating_company_id,
                u.samsara_vehicle_id,
                COALESCE(p.lat, 0) AS lat, COALESCE(p.lng, 0) AS lng, p.speed_mph
         FROM mdata.units u
         LEFT JOIN telematics.vehicle_latest_position p ON p.unit_id = u.id
         WHERE u.deactivated_at IS NULL AND u.samsara_vehicle_id IS NOT NULL
         LIMIT 200`
      );
      for (const row of units.rows) {
        if (!row.lat || !row.lng) continue;
        await client.query(
          `INSERT INTO integrations.samsara_vehicle_positions
             (operating_company_id, unit_uuid, samsara_vehicle_id, lat, lng, speed_mph, recorded_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, now())
           ON CONFLICT (operating_company_id, unit_uuid)
           DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, speed_mph = EXCLUDED.speed_mph,
                         recorded_at = EXCLUDED.recorded_at, updated_at = now()`,
          [row.operating_company_id, row.unit_uuid, row.samsara_vehicle_id, row.lat, row.lng, row.speed_mph]
        );
      }
      app.log.debug({ count: units.rowCount }, `[${WORKER_NAME}] upserted positions`);
    });
  } finally {
    running = false;
  }
}

export function initializeSamsaraPositionPollWorker(app: FastifyInstance) {
  const tick = async () => {
    try {
      await pollSamsaraPositions(app);
    } catch (err) {
      app.log.error({ err }, `[${WORKER_NAME}] tick failed`);
    }
    timer = setTimeout(tick, process.env.NODE_ENV === "test" ? 0 : INTERVAL_MS);
  };
  if (process.env.NODE_ENV !== "test") tick();
  app.log.info(`[${WORKER_NAME}] initialized (30s interval)`);
  return () => { if (timer) clearTimeout(timer); };
}
