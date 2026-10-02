/**
 * ENGINE: lane profitability refresh
 * SCHEDULE: 0 2 * * * America/Chicago
 * WRITES: lane profitability rows
 * IDEMPOTENCY: UNIQUE(company, lane, period — uq_lane_profit_company_lane_period) ON CONFLICT DO UPDATE
 * OVERLAP: the twin upserts the same rows
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { refreshLaneProfitabilityLast12Months } from "./lane-profitability.service.js";

let initialized = false;

export async function runLaneProfitabilityRefreshTick(operatingCompanyId: string) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
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
          // ROUND 330.7: read the company list, RELEASE that connection, then run each company. Holding the outer
          // transaction open while each company borrowed a SECOND pooled connection meant two concurrent ticks (both
          // instances) needed four of the five pool slots. On the fork the pair completed alone but HUNG on the pool when other
          // engines in the same process held connections — the idle outer transaction is pure pool pressure.
          const companies = await withLuciaBypass((client) => client.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE is_active = true`));
          for (const company of companies.rows) {
            assertTenantContext(company.id, "reports.lane_profitability_refresh_cron");
            await runLaneProfitabilityRefreshTick(company.id);
          }
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Lane profitability refresh cron scheduled (daily 02:00 America/Chicago)");
}
