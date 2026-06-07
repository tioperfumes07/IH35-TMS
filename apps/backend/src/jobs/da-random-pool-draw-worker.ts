/**
 * Drug & Alcohol Random Pool Draw Worker — GAP-81
 * FMCSA Part 382 §382.305: quarterly random draws (Jan/Apr/Jul/Oct 1st).
 * Cron: "0 7 1 1,4,7,10 *" (07:00 CST on 1st of each quarter start month).
 *
 * Registration: import and call initializeDaRandomPoolDrawWorker(app) in index.ts.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { drawRandomPool, listActiveEnrolledDrivers } from "../safety/drug-alcohol/random-pool.service.js";

let initialized = false;

/** FMCSA quarterly random draw cron — runs at 07:00 CST on Jan 1, Apr 1, Jul 1, Oct 1. */
const CRON_EXPRESSION = "0 7 1 1,4,7,10 *";
const CRON_TZ = "America/Chicago";
const CRON_NAME = "safety.da_random_pool.quarterly_draw";

export async function listActiveCompanyIds(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> }
): Promise<string[]> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM org.companies
      WHERE is_active = true
        AND deactivated_at IS NULL
      ORDER BY id
    `
  );
  return res.rows.map((r) => r.id);
}

export async function runDaRandomPoolDrawTick(deps?: {
  withLuciaBypassImpl?: typeof withLuciaBypass;
}): Promise<{ companiesProcessed: number; companiesSkipped: number; drawsCreated: number }> {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  let companiesProcessed = 0;
  let companiesSkipped = 0;
  let drawsCreated = 0;

  await withLuciaBypassImpl(async (client) => {
    const companyIds = await listActiveCompanyIds(client);

    for (const companyId of companyIds) {
      const enrolled = await listActiveEnrolledDrivers(client, companyId);
      if (enrolled.length === 0) {
        companiesSkipped += 1;
        continue;
      }
      await drawRandomPool(client, companyId);
      drawsCreated += 1;
      companiesProcessed += 1;
    }
  });

  return { companiesProcessed, companiesSkipped, drawsCreated };
}

export function initializeDaRandomPoolDrawWorker(app: FastifyInstance): void {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_DA_RANDOM_POOL_DRAW_WORKER === "false") {
    app.log.info("DA random pool draw worker disabled via ENABLE_DA_RANDOM_POOL_DRAW_WORKER=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const result = await runDaRandomPoolDrawTick();
          app.log.info(
            { draws_created: result.drawsCreated, skipped: result.companiesSkipped },
            "da_random_pool quarterly draw complete"
          );
        },
        app.log
      );
    },
    { timezone: CRON_TZ }
  );

  app.log.info("DA random pool draw worker scheduled (quarterly: Jan/Apr/Jul/Oct 1st 07:00 CST)");
}
