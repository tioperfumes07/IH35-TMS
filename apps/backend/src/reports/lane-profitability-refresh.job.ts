import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { refreshLaneProfitabilityLast12Months } from "./lane-profitability.service.js";

let initialized = false;

export async function runLaneProfitabilityRefreshTick(operatingCompanyId: string) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    await refreshLaneProfitabilityLast12Months(client, operatingCompanyId);
  });
}

export function initializeLaneProfitabilityRefreshCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_LANE_PROFITABILITY_REFRESH_CRON === "false") {
    app.log.info("Lane profitability refresh cron disabled via ENABLE_LANE_PROFITABILITY_REFRESH_CRON=false");
    return;
  }

  cron.schedule(
    "0 2 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "reports.lane_profitability_refresh_cron",
        async () => {
          await withLuciaBypass(async (client) => {
            const companies = await client.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE is_active = true`);
            for (const company of companies.rows) {
              assertTenantContext(company.id, "reports.lane_profitability_refresh_cron");
              await runLaneProfitabilityRefreshTick(company.id);
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Lane profitability refresh cron scheduled (daily 02:00 America/Chicago)");
}
