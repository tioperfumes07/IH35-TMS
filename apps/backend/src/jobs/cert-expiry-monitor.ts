import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { createNotification, listCompanyNotifyUserIds } from "../notifications/notification.service.js";
import { notifyCriticalExpiries } from "../safety/expiry-tracking/alerter.service.js";
import { scanUnitPermitExpiries } from "../master-data/units/permits/service.js";
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

      const permitAlerts = (await scanUnitPermitExpiries(client, operatingCompanyId)).filter(
        (alert) => alert.severity === "critical"
      );
      if (permitAlerts.length > 0) {
        const recipientUserIds = await listCompanyNotifyUserIds(client, operatingCompanyId, [
          "Owner",
          "Administrator",
          "Manager",
          "Safety",
        ]);
        for (const alert of permitAlerts) {
          const title = `${alert.permit_label} expires soon`;
          const body = `Unit ${alert.unit_number} has ${alert.permit_label} expiring on ${alert.expiry_date} (${alert.days_until_expiry} days).`;
          for (const userId of recipientUserIds) {
            await createNotification(
              {
                operating_company_id: operatingCompanyId,
                user_id: userId,
                type: "compliance_expiring",
                severity: "critical",
                title,
                body,
                action_link: `/fleet/units/${alert.unit_uuid}?tab=permits`,
                entity_type: "unit",
                entity_id: alert.unit_uuid,
                source_block: "gap-85-permit-toll",
              },
              client
            );
          }
        }
      }
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
