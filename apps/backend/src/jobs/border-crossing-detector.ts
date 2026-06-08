/**
 * GAP-26 — Border crossing detector worker.
 * Runs every 5 minutes, processes recent Samsara position events.
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";

const WORKER_NAME = "dispatch.border_crossing_detector";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.BORDER_CROSSING_DETECTOR_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function tick(app: FastifyInstance) {
  const processed = await withLuciaBypass(async (client) => {
    // Get positions from last tick window near border area (TX/Tamaulipas bounding box)
    const windowMs = intervalMs() + 60_000; // slight overlap
    const res = await client.query(
      `SELECT DISTINCT ON (vehicle_id)
              vehicle_id,
              operating_company_id,
              latitude,
              longitude,
              'northbound' AS direction,
              occurred_at::text
       FROM integrations.samsara_positions
       WHERE occurred_at >= now() - ($1 * INTERVAL '1 millisecond')
         AND latitude BETWEEN 27.0 AND 29.0
         AND longitude BETWEEN -100.5 AND -99.0
       ORDER BY vehicle_id, occurred_at DESC`,
      [windowMs]
    );

    if (res.rows.length === 0) return 0;

    const { detectCrossings } = await import("../integrations/samsara/border-crossings/detector.service.js");
    return detectCrossings(client, res.rows);
  });
  app.log.info({ processed }, `[${WORKER_NAME}] tick complete`);
}

export function initializeBorderCrossingDetectorWorker(app: FastifyInstance) {
  const ms = intervalMs();

  const run = async () => {
    try {
      await tick(app);
    } catch (err) {
      app.log.error({ err }, `[${WORKER_NAME}] tick failed`);
    }
  };

  void run();
  timer = setInterval(() => { void run(); }, ms);
  app.log.info({ intervalMs: ms }, `[${WORKER_NAME}] started`);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
