/**
 * GAP-60 — Driver safety composite score aggregator.
 * Weekly cron: Monday 03:00 America/Chicago.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { aggregateForPeriod, previousWeekPeriod } from "../safety/driver-scoring/scoring.service.js";

let initialized = false;

const CRON_EXPRESSION = "0 3 * * 1";
const CRON_TZ = "America/Chicago";
const CRON_NAME = "safety.driver_scoring.weekly_aggregator";

export async function runDriverScoringAggregatorTick(deps?: {
  withLuciaBypassImpl?: typeof withLuciaBypass;
}): Promise<{ companiesProcessed: number; rowsWritten: number }> {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  const { period_start, period_end } = previousWeekPeriod();
  let companiesProcessed = 0;
  let rowsWritten = 0;

  await withLuciaBypassImpl(async (client) => {
    const companies = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM org.companies
        WHERE is_active = true
          AND deactivated_at IS NULL
        ORDER BY id
      `
    );

    for (const { id } of companies.rows) {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [id]);
      const result = await aggregateForPeriod(client, id, period_start, period_end);
      rowsWritten += result.rows_written;
      companiesProcessed += 1;
    }
  });

  return { companiesProcessed, rowsWritten };
}

export function initializeDriverScoringAggregatorWorker(app: FastifyInstance): void {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_DRIVER_SCORING_AGGREGATOR_WORKER === "false") {
    app.log.info("Driver scoring aggregator disabled via ENABLE_DRIVER_SCORING_AGGREGATOR_WORKER=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const result = await runDriverScoringAggregatorTick();
          app.log.info(
            { companies: result.companiesProcessed, rows_written: result.rowsWritten },
            "driver_scoring weekly aggregation complete"
          );
        },
        app.log
      );
    },
    { timezone: CRON_TZ }
  );

  app.log.info("Driver scoring aggregator scheduled (weekly Mon 03:00 America/Chicago)");
}
