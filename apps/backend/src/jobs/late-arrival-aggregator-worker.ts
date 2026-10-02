/**
 * ENGINE: late arrival aggregator
 * SCHEDULE: every 6 h (setInterval)
 * WRITES: late arrival aggregates
 * IDEMPOTENCY: UNIQUE(operating_company_id, driver_id, bucket_date) ON CONFLICT DO UPDATE (uq_late_arrival_driver_day)
 * OVERLAP: the twin upserts the same rows
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * GAP-30 — Late-arrival analytics aggregator worker (every 6h).
 */

import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { runLateArrivalAggregatorTick } from "../dispatch/analytics/late-arrival.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

const WORKER_NAME = "dispatch.late_arrival_aggregator_worker";
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.LATE_ARRIVAL_AGGREGATOR_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function tick(app: FastifyInstance) {
  const processed = await withLuciaBypass(async (client) => runLateArrivalAggregatorTick(client));
  app.log.info({ processed }, `[${WORKER_NAME}] tick complete`);
}

export function initializeLateArrivalAggregatorWorker(app: FastifyInstance) {
  const ms = intervalMs();

  // ROUND 330.7: through the shared wrapper (run recorded, failure logged + Sentry) so the single-fire lease reaches it.
  const run = () => wrapBackgroundJobTick(WORKER_NAME, () => tick(app), app.log);

  void run();
  timer = setInterval(() => {
    void run();
  }, ms);

  app.log.info({ intervalMs: ms }, `[${WORKER_NAME}] started`);
}

export function stopLateArrivalAggregatorWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
