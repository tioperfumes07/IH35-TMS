import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { refreshDeadheadCache } from "./deadhead.service.js";

let initialized = false;

export async function runDeadheadRefreshTick(operatingCompanyId: string) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    await refreshDeadheadCache(client, operatingCompanyId);
  });
}

export function initializeDeadheadRefreshCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_DEADHEAD_REFRESH_CRON === "false") {
    app.log.info("Deadhead refresh cron disabled via ENABLE_DEADHEAD_REFRESH_CRON=false");
    return;
  }

  cron.schedule(
    "0 3 * * 1",
    async () => {
      await wrapBackgroundJobTick(
        "reports.deadhead_refresh_cron",
        async () => {
          await withLuciaBypass(async (client) => {
            const companies = await client.query<{ id: string }>(`SELECT id::text FROM org.companies`);
            for (const company of companies.rows) {
              assertTenantContext(company.id, "reports.deadhead_refresh_cron");
              await runDeadheadRefreshTick(company.id);
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Deadhead refresh cron scheduled (weekly Monday 03:00 America/Chicago)");
}
