/**
 * ENGINE: deadhead refresh
 * SCHEDULE: 0 3 * * 1 America/Chicago
 * WRITES: deadhead weekly rows
 * IDEMPOTENCY: UNIQUE(operating_company_id, unit_id, week_starting) ON CONFLICT DO UPDATE (uq_deadhead_company_unit_week, migration 202615300900)
 * OVERLAP: the twin upserts the same rows
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { refreshDeadheadCache } from "./deadhead.service.js";

let initialized = false;

export async function runDeadheadRefreshTick(operatingCompanyId: string) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
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
          // ROUND 330.7: read the company list, RELEASE that connection, then run each company. Holding the outer
          // transaction open while each company borrowed a SECOND pooled connection meant two concurrent ticks (both
          // instances) needed four of the five pool slots. On the fork the pair completed alone but HUNG on the pool when other
          // engines in the same process held connections — the idle outer transaction is pure pool pressure.
          const companies = await withLuciaBypass((client) => client.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE is_active = true`));
          for (const company of companies.rows) {
            assertTenantContext(company.id, "reports.deadhead_refresh_cron");
            await runDeadheadRefreshTick(company.id);
          }
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Deadhead refresh cron scheduled (weekly Monday 03:00 America/Chicago)");
}
