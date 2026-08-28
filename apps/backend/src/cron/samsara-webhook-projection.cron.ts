import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { recordBackgroundJobDisabled, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { projectSamsaraWebhookEventsForTenant } from "../integrations/samsara/webhook-projection.service.js";

const CRON_NAME = "samsara.webhook_projection_cron";
let initialized = false;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

async function listActiveTenantIds(client: DbClient): Promise<string[]> {
  const res = await client.query<{ operating_company_id: string }>(
    `
      SELECT id::text AS operating_company_id
      FROM org.companies
      WHERE is_active = true
        AND deactivated_at IS NULL
      ORDER BY id
    `
  );
  return res.rows.map((row) => row.operating_company_id);
}

export async function runSamsaraWebhookProjectionTick(): Promise<void> {
  await withLuciaBypass(async (client) => {
    const tenants = await listActiveTenantIds(client);
    for (const operatingCompanyId of tenants) {
      assertTenantContext(operatingCompanyId, CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      await projectSamsaraWebhookEventsForTenant(client, operatingCompanyId);
    }
  });
}

export function initializeSamsaraWebhookProjectionCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON ?? "true").trim() === "false") {
    app.log.info("Samsara webhook projection cron disabled via ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON=false");
    // GO-0017-L3: an early return is an outcome, not an absence — record it so
    // _system.background_jobs stays fresh (refreshed on every boot) instead of frozen forever.
    recordBackgroundJobDisabled(CRON_NAME).catch((err) => app.log.warn({ err }, `[background-job:${CRON_NAME}] failed to record disabled-outcome`));
    return;
  }

  cron.schedule(
    "*/1 * * * *",
    async () => {
      await wrapBackgroundJobTick(CRON_NAME, async () => {
        await runSamsaraWebhookProjectionTick();
      }, app.log);
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Samsara webhook projection cron scheduled (every minute, America/Chicago)");
}
