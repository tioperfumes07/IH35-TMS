import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
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

export function initializeSamsaraWebhookProjectionCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON ?? "true").trim() === "false") {
    app.log.info("Samsara webhook projection cron disabled via ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON=false");
    return;
  }

  cron.schedule(
    "*/1 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          await withLuciaBypass(async (client) => {
            const tenants = await listActiveTenantIds(client);
            for (const operatingCompanyId of tenants) {
              assertTenantContext(operatingCompanyId, CRON_NAME);
              await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
              await projectSamsaraWebhookEventsForTenant(client, operatingCompanyId);
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Samsara webhook projection cron scheduled (every minute, America/Chicago)");
}
