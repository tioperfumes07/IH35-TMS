import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { companyHasQboConnectionRecord, getConnectionsWithAccessTokenExpiringWithin, getQboConnectionStatus, refreshAccessToken } from "../integrations/qbo/qbo-oauth.service.js";
import { sendEmail } from "../notifications/email.service.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

let initialized = false;
const disconnectAlertCooldownMs = 12 * 60 * 60 * 1000;
const lastDisconnectAlertAt = new Map<string, number>();

async function listActiveCompanyIds() {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM org.companies
        WHERE is_active = true
        ORDER BY id
      `
    );
    return res.rows.map((row) => row.id);
  });
}

export async function initializeQboTokenRefreshCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  markRunnerInitialized("token_refresh_cron");
  if (process.env.ENABLE_QBO_TOKEN_REFRESH_CRON === "false") {
    app.log.info("QBO token refresh cron disabled via ENABLE_QBO_TOKEN_REFRESH_CRON=false");
    return;
  }

  // Refresh tokens hourly so QBO links remain continuously usable.
  cron.schedule(
    "0 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "qbo.token_refresh_cron",
        async () => {
          markRunnerTick("token_refresh_cron");
          // Select on the ACCESS token's expiry (not the ~100-day refresh token) with a 12h window —
          // comfortably wider than the 1h tick — so every already-dead or soon-to-die access token is
          // caught and refreshed each tick, keeping the QBO link continuously live after each re-auth.
          const expiring = await getConnectionsWithAccessTokenExpiringWithin(12 * 3600);
          for (const conn of expiring) {
            assertTenantContext(conn.operating_company_id, "qbo.token_refresh_cron");
            try {
              await refreshAccessToken(conn.id, conn.operating_company_id, process.env.SYSTEM_ACTOR_USER_ID || undefined);
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
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  // Watchdog: alert if any active company loses QBO connectivity.
  cron.schedule(
    "*/15 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "qbo.token_refresh_cron",
        async () => {
          markRunnerTick("token_refresh_cron");
          const activeCompanyIds = await listActiveCompanyIds();
          for (const companyId of activeCompanyIds) {
            assertTenantContext(companyId, "qbo.token_refresh_cron");
            try {
              const status = await getQboConnectionStatus(companyId);
              if (status.connected) {
                lastDisconnectAlertAt.delete(companyId);
                continue;
              }

              // Skip entities that were NEVER connected (no qbo_connections row at all) — they are not
              // "disconnected", they are simply not QBO tenants (e.g. parallel-books USMCA). Without this
              // they get a re-auth reminder email every 15 min forever (the in-memory cooldown resets on
              // each deploy). Per-company check because qbo_connections RLS is company-scoped, not bypassable.
              if (!(await companyHasQboConnectionRecord(companyId))) {
                lastDisconnectAlertAt.delete(companyId);
                continue;
              }

              const now = Date.now();
              const lastAlert = lastDisconnectAlertAt.get(companyId) ?? 0;
              if (now - lastAlert < disconnectAlertCooldownMs) continue;
              lastDisconnectAlertAt.set(companyId, now);

              const message = `QBO disconnected for company ${companyId}. Re-authorize from forensic review page.`;
              markRunnerFailed("token_refresh_cron", new Error(message));
              app.log.warn({ companyId }, "QBO watchdog detected disconnected company");
              await sendEmail({
                to: "tioperfumes07@gmail.com",
                subject: `[IH 35 TMS] QBO disconnected: ${companyId}`,
                sender: "noreply",
                html: `<p>${message}</p>`,
                text: message,
                eventClass: "integrations.qbo.watchdog_disconnected",
                tags: [{ name: "type", value: "qbo_alert" }],
                actorUserId: null,
              });
            } catch (error) {
              markRunnerFailed("token_refresh_cron", error);
              app.log.error({ err: error, companyId }, "QBO watchdog failed");
            }
          }
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("QBO token refresh cron initialized: hourly refresh + 15m connectivity watchdog");
}

