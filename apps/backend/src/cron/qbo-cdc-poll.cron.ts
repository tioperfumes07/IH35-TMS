import type { FastifyInstance } from "fastify";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";
import { listConfiguredWave2Realms, runQboCdcIngest } from "../integrations/qbo/qbo-cdc.service.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

/** Poll QuickBooks CDC every 5 minutes for configured TRK/TRANSP realms (see env QBO_REALM_ID_*). */
export function initializeQboCdcPollCron(app: FastifyInstance) {
  // USMCA-ONLY-UNTIL-LAUNCH: QBO sync is parked. Opt-in only — default-on + startup tick
  // blocked the Node event loop (invalid_grant token refresh) and Render SIGTERM'd healthz.
  if (process.env.ENABLE_QBO_CDC_POLL !== "true") {
    app.log.info("[qbo_cdc_poll] disabled unless ENABLE_QBO_CDC_POLL=true");
    return;
  }

  markRunnerInitialized("qbo_cdc_poll");

  const tick = async () => {
    await wrapBackgroundJobTick(
      "integrations.qbo_cdc_poll",
      async () => {
        markRunnerTick("qbo_cdc_poll");
        const realms = await listConfiguredWave2Realms();
        if (!realms.length) {
          app.log.debug("[qbo_cdc_poll] no configured realm env ids matched active connections — skipping");
          return;
        }
        for (const row of realms) {
          assertTenantContext(row.operating_company_id, "integrations.qbo_cdc_poll");
          try {
            await runQboCdcIngest({
              operating_company_id: row.operating_company_id,
              qbo_realm_id: row.realm_id,
              triggered_by: "cdc_poll",
              logWarning: (msg, meta) => app.log.warn({ msg, meta }),
            });
          } catch (error) {
            app.log.error({ err: error, realm: row.realm_id }, "[qbo_cdc_poll] realm ingest failed");
          }
        }
      },
      app.log,
      { onError: (error) => markRunnerFailed("qbo_cdc_poll", error) }
    );
  };

  setInterval(() => {
    void tick();
  }, 5 * 60 * 1000);
}
