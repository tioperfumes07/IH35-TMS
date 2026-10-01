/**
 * Border-crossing projector (ROUND 306 E-29 addition). Projects dispatch.border_crossing_events from the
 * canonical geofence events (projectBorderCrossingsFromFenceEvents) every 5 minutes over the last 2 days;
 * idempotent. Reads the database only -- no Samsara call, no second inside/outside decision.
 * BORDER_CROSSING_DETECTOR_INTERVAL_MS overrides the interval (min 60 s).
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { USMCA_COMPANY_ID } from "../org/companies.routes.js";
import { projectBorderCrossingsFromFenceEvents } from "../integrations/samsara/border-crossings/detector.service.js";

const WORKER_NAME = "dispatch.border_crossing_detector";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const LOOKBACK_MS = 2 * 24 * 3600 * 1000;
let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.BORDER_CROSSING_DETECTOR_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function tick(app: FastifyInstance) {
  const result = await withLuciaBypass(async (client) => {
    // membership-scope-exempt: USMCA-only worker (standing rule 1)
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
    return projectBorderCrossingsFromFenceEvents(client as never, USMCA_COMPANY_ID, new Date(Date.now() - LOOKBACK_MS).toISOString());
  });
  app.log.info(result, `[${WORKER_NAME}] tick complete`);
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
  app.log.info({ intervalMs: ms }, `[${WORKER_NAME}] started (projects from geo.geofence_events)`);
  return () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
