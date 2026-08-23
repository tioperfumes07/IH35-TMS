import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { computeRetentionScore, upsertRetentionScore } from "../drivers/retention/scorer.service.js";

const WORKER_NAME = "drivers.retention_scorer_worker";
const CRON_EXPRESSION = "0 4 * * 1";
const CRON_TZ = "America/Chicago";

// Version-agnostic across node-cron majors: infer the scheduled-task type from cron.schedule itself
// rather than the `cron.ScheduledTask` namespace type (removed/renamed in newer node-cron type defs,
// which broke build-typecheck on the dependency bump PRs #1634/#1635).
let task: ReturnType<typeof cron.schedule> | undefined;

export async function runDriverRetentionScorerTick(): Promise<{ drivers_scored: number }> {
  let driversScored = 0;
  await withLuciaBypass(async (client) => {
    const table = await client.query(`SELECT to_regclass('drivers.retention_scores') AS rel`);
    if (!table.rows[0]?.rel) return;

    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL`
    );
    for (const company of companies.rows) {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      const drivers = await client.query<{ id: string }>(
        `SELECT id::text AS id
           FROM mdata.drivers d
          WHERE (
            d.operating_company_id = $1::uuid
            OR EXISTS (
              SELECT 1 FROM mdata.driver_company_authorizations retention_worker_dca
              WHERE retention_worker_dca.driver_id = d.id
                AND retention_worker_dca.company_id = $1::uuid
                AND retention_worker_dca.is_authorized = true
                AND retention_worker_dca.deactivated_at IS NULL
            )
          )
            AND d.deactivated_at IS NULL
            AND d.archived_at IS NULL`,
        [company.id]
      );
      for (const driver of drivers.rows) {
        const score = await computeRetentionScore(client, company.id, driver.id);
        await upsertRetentionScore(client, score);
        driversScored += 1;
      }
    }
  });
  return { drivers_scored: driversScored };
}

export function initializeDriverRetentionScorerWorker(app: FastifyInstance) {
  task = cron.schedule(
    CRON_EXPRESSION,
    () => {
      void runDriverRetentionScorerTick()
        .then((result) => app.log.info({ result }, `[${WORKER_NAME}] tick complete`))
        .catch((err) => app.log.error({ err }, `[${WORKER_NAME}] tick failed`));
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );
  app.log.info({ cron: CRON_EXPRESSION, tz: CRON_TZ }, `[${WORKER_NAME}] started`);
}

export function stopDriverRetentionScorerWorker() {
  task?.stop();
  task = undefined;
}
