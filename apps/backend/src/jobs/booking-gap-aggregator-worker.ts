/**
 * GAP-29 — Booking gap aggregator worker (every 6h).
 * Pre-warms the analytics query for the current week so the report loads fast.
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { aggregateForPeriod } from "../dispatch/analytics/booking-gap.service.js";

const WORKER_NAME = "dispatch.booking_gap_aggregator";
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.BOOKING_GAP_AGGREGATOR_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function tick(app: FastifyInstance) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const processed = await withLuciaBypass(async (client) => {
    const companies = await client
      .query<{ id: string }>(
        `SELECT id::text AS id FROM org.companies WHERE is_active = true LIMIT 100`
      )
      .catch(() => ({ rows: [] as { id: string }[] }));

    let count = 0;
    for (const { id } of companies.rows) {
      try {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [id]);
        const result = await aggregateForPeriod(client, id, from, to);
        count += result.dispatchers.length;
      } catch (err) {
        app.log.warn({ err, company_id: id }, `[${WORKER_NAME}] company tick failed`);
      }
    }
    return count;
  });

  app.log.info({ processed }, `[${WORKER_NAME}] tick complete`);
}

export function initializeBookingGapAggregatorWorker(app: FastifyInstance) {
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

export function stopBookingGapAggregatorWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
