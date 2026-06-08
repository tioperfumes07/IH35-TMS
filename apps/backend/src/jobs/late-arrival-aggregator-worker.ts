/**
 * GAP-30 — Late-arrival analytics aggregator worker (every 6h).
 */

import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { runLateArrivalAggregatorTick } from "../dispatch/analytics/late-arrival.service.js";

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

  const run = async () => {
    try {
      await tick(app);
    } catch (err) {
      app.log.error({ err }, `[${WORKER_NAME}] tick failed`);
    }
  };

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
