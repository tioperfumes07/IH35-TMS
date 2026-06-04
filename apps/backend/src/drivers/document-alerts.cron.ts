import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runDocumentAlertEngineForTenant } from "./document-alerts.service.js";

let initialized = false;

export async function runDocumentAlertEngineCronTick() {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );
    for (const company of companies.rows) {
      assertTenantContext(String(company.id ?? ""), "drivers.document_alert_engine_cron");
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [company.id]);
      await runDocumentAlertEngineForTenant(client, company.id);
    }
  });
}

export function initializeDocumentAlertEngineCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_DOCUMENT_ALERT_ENGINE_CRON === "false") {
    app.log.info("Document alert engine cron disabled via ENABLE_DOCUMENT_ALERT_ENGINE_CRON=false");
    return;
  }

  cron.schedule(
    "35 7 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "drivers.document_alert_engine_cron",
        async () => {
          await runDocumentAlertEngineCronTick();
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Document alert engine cron scheduled (daily 07:35 America/Chicago)");
}
