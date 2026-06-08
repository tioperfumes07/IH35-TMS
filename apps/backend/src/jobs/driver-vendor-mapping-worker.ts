/**
 * GAP-52 — Daily driver↔QBO vendor mapping integrity worker (24h).
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { createNotification, listCompanyNotifyUserIds } from "../notifications/notification.service.js";
import { checkAllMappings, persistFindings } from "../integrations/integrity-monitors/driver-vendor-mapping.js";

const WORKER_NAME = "integrations.driver_vendor_mapping_daily";
const INTERVAL_MS = 24 * 60 * 60 * 1000;
let timer: NodeJS.Timeout | undefined;

async function runScan(app: FastifyInstance) {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL`
    );
    for (const { id } of companies.rows) {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [id]);
      const findings = await checkAllMappings(client);
      await persistFindings(client, id, findings);
      const critical = findings.filter((f) => f.severity === "critical");
      if (critical.length > 0) {
        const recipients = await listCompanyNotifyUserIds(client, id, ["Owner", "Accounting"]);
        for (const userId of recipients) {
          await createNotification({
            operating_company_id: id,
            user_id: userId,
            type: "system",
            severity: "critical",
            title: "Driver↔QBO vendor mapping drift detected",
            body: `${critical.length} critical mapping drift(s) require review.`,
            source_block: "GAP-52",
          });
        }
      }
      app.log.info({ company_id: id, findings: findings.length }, `[${WORKER_NAME}] scan complete`);
    }
  });
}

export function initializeDriverVendorMappingWorker(app: FastifyInstance) {
  const schedule = () => {
    timer = setTimeout(async () => {
      try {
        await runScan(app);
      } catch (err) {
        app.log.error({ err }, `[${WORKER_NAME}] failed`);
      }
      schedule();
    }, process.env.NODE_ENV === "test" ? 0 : INTERVAL_MS);
  };
  if (process.env.NODE_ENV !== "test") schedule();
  app.log.info(`[${WORKER_NAME}] initialized`);
  return () => { if (timer) clearTimeout(timer); };
}
