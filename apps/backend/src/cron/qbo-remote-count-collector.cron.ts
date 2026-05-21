import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { collectQboRemoteCounts, listQboConnectedOperatingCompanies, qboRemoteCountEntityTypes } from "../integrations/qbo/remote-count-collector.js";

let initialized = false;

async function runCollectorTick(app: FastifyInstance, runMode: "delta" | "full") {
  const companies = await listQboConnectedOperatingCompanies();
  if (companies.length === 0) {
    app.log.info({ runMode }, "[QBO_REMOTE_COUNT_COLLECTOR] no active QBO connections");
    return;
  }

  for (const operatingCompanyId of companies) {
    assertTenantContext(operatingCompanyId, "qbo.remote_count_collector");
    const result = await collectQboRemoteCounts(operatingCompanyId, {
      runMode,
      entityTypes: qboRemoteCountEntityTypes(),
      collectionRunId: randomUUID(),
    });

    app.log.info(
      {
        runMode,
        operating_company_id: result.operating_company_id,
        collected_count: result.collected_count,
        failed: result.failed,
        failure_streak: result.failure_streak,
      },
      "[QBO_REMOTE_COUNT_COLLECTOR] company tick finished"
    );
  }
}

export function initializeQboRemoteCountCollectorCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.QBO_REMOTE_COUNT_COLLECTOR_ENABLED ?? "true").trim() === "false") {
    app.log.info("QBO remote-count collector cron disabled via QBO_REMOTE_COUNT_COLLECTOR_ENABLED=false");
    return;
  }

  cron.schedule(
    "10 */6 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "qbo.remote_count_collector.delta",
        async () => {
          await runCollectorTick(app, "delta");
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  cron.schedule(
    "20 2 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "qbo.remote_count_collector.full",
        async () => {
          await runCollectorTick(app, "full");
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("QBO remote-count collector cron initialized (delta: every 6h, full: 02:20 America/Chicago)");
}
