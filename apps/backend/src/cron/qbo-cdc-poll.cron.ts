import type { FastifyInstance } from "fastify";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";
import { listConfiguredWave2Realms, runQboCdcIngest } from "../integrations/qbo/qbo-cdc.service.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

/** Poll QuickBooks CDC every 5 minutes for configured TRK/TRANSP realms (see env QBO_REALM_ID_*). */
export function initializeQboCdcPollCron(app: FastifyInstance) {
  markRunnerInitialized("qbo_cdc_poll");
  setInterval(async () => {
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
  }, 5 * 60 * 1000);
}
