import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { getConnectionsExpiringWithin, refreshAccessToken } from "../integrations/qbo/qbo-oauth.service.js";
import { sendEmail } from "../notifications/email.service.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";

let initialized = false;

export async function initializeQboTokenRefreshCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  markRunnerInitialized("token_refresh_cron");
  if (process.env.ENABLE_QBO_TOKEN_REFRESH_CRON === "false") {
    app.log.info("QBO token refresh cron disabled via ENABLE_QBO_TOKEN_REFRESH_CRON=false");
    return;
  }

  cron.schedule(
    "0 */6 * * *",
    async () => {
      markRunnerTick("token_refresh_cron");
      const expiring = await getConnectionsExpiringWithin(12 * 3600);
      for (const conn of expiring) {
        try {
          await refreshAccessToken(conn.id, process.env.SYSTEM_ACTOR_USER_ID || undefined);
        } catch (error) {
          markRunnerFailed("token_refresh_cron", error);
          app.log.error({ err: error, connectionId: conn.id }, "QBO token refresh failed");
          await sendEmail({
            to: "tioperfumes07@gmail.com",
            subject: `[IH 35 TMS] QBO connection needs re-authorization: ${conn.operating_company_id}`,
            sender: "noreply",
            html: `<p>QBO token refresh failed for operating company ${conn.operating_company_id}. Re-authorize from forensic review page.</p>`,
            text: `QBO token refresh failed for operating company ${conn.operating_company_id}. Re-authorize from forensic review page.`,
            eventClass: "integrations.qbo.refresh_failed",
            tags: [{ name: "type", value: "qbo_alert" }],
            actorUserId: null,
          });
        }
      }
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("QBO token refresh cron initialized: 1 job every 6h");
}

