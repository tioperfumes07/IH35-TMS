import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runIntegrityAlertEngineForTenant } from "./integrity-alert-engine.service.js";

let initialized = false;

export async function runIntegrityAlertEngineCronTick() {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );
    for (const company of companies.rows) {
      assertTenantContext(String(company.id ?? ""), "safety.integrity_alert_engine_cron");
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [company.id]);
      await runIntegrityAlertEngineForTenant(client, company.id);
    }
  });
}

export function initializeIntegrityAlertEngineCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_INTEGRITY_ALERT_ENGINE_CRON === "false") {
    app.log.info("Integrity alert engine cron disabled via ENABLE_INTEGRITY_ALERT_ENGINE_CRON=false");
    return;
  }

  cron.schedule(
    "20 */6 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "safety.integrity_alert_engine_cron",
        async () => {
          await runIntegrityAlertEngineCronTick();
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Integrity alert engine cron scheduled (every 6h at :20 America/Chicago)");
}
