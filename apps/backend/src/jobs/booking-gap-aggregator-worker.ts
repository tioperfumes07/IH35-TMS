/**
 * ENGINE: booking gap aggregator
 * SCHEDULE: every 6 h (setInterval)
 * WRITES: nothing (read-only pre-warm)
 * IDEMPOTENCY: DETERMINISTIC OVERWRITE — read-only, writes no row
 * OVERLAP: nothing to duplicate
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * GAP-29 — Booking gap aggregator worker (every 6h).
 * Pre-warms the analytics query for the current week so the report loads fast.
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { aggregateForPeriod } from "../dispatch/analytics/booking-gap.service.js";
import { addBusinessDateDays, companyBusinessDate } from "../lib/company-business-date.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

const WORKER_NAME = "dispatch.booking_gap_aggregator";
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.BOOKING_GAP_AGGREGATOR_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function tick(app: FastifyInstance) {
  const to = companyBusinessDate();
  const from = addBusinessDateDays(to, -7);

  const processed = await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM org.companies WHERE is_active = true LIMIT 100`
      );

    let count = 0;
    for (const { id } of companies.rows) {
      try {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [id]);
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

  // ROUND 330.7: through the shared wrapper (run recorded, failure logged + Sentry) so the single-fire lease reaches it.
  const run = () => wrapBackgroundJobTick(WORKER_NAME, () => tick(app), app.log);

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
