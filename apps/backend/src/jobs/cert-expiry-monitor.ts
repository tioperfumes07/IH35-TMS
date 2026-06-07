import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { notifyCriticalExpiries } from "../safety/expiry-tracking/alerter.service.js";
import { scanAllDrivers } from "../safety/expiry-tracking/cert-monitor.service.js";

let initialized = false;

export async function runCertExpiryMonitorTick(app: FastifyInstance) {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ operating_company_id: string }>(
      `
        SELECT DISTINCT operating_company_id::text AS operating_company_id
        FROM mdata.drivers
        WHERE deactivated_at IS NULL
      `
    );

    for (const row of companies.rows) {
      const operatingCompanyId = String(row.operating_company_id ?? "");
      if (!operatingCompanyId) continue;
      assertTenantContext(operatingCompanyId, "safety.cert_expiry_monitor");
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const alerts = await scanAllDrivers(client, operatingCompanyId);
      await notifyCriticalExpiries(client, operatingCompanyId, alerts);
    }
  });
}

export function initializeCertExpiryMonitor(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_CERT_EXPIRY_MONITOR === "false") {
    app.log.info("Cert expiry monitor disabled via ENABLE_CERT_EXPIRY_MONITOR=false");
    return;
  }

  cron.schedule(
    "0 6 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "safety.cert_expiry_monitor",
        async () => {
          await runCertExpiryMonitorTick(app);
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Cert expiry monitor scheduled (daily 06:00 America/Chicago)");
}
