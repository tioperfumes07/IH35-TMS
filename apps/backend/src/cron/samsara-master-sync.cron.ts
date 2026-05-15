import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { syncSamsaraDriversMaster, syncSamsaraVehiclesMaster } from "../integrations/samsara/samsara-master-sync.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

let initialized = false;

export function initializeSamsaraMasterSyncCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_SAMSARA_MASTER_SYNC_CRON === "false") {
    app.log.info("Samsara master sync cron disabled via ENABLE_SAMSARA_MASTER_SYNC_CRON=false");
    return;
  }

  cron.schedule(
    "30 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "samsara.master_sync_cron",
        async () => {
          await withLuciaBypass(async (client) => {
            const res = await client.query<{ operating_company_id: string }>(
              `SELECT operating_company_id::text AS operating_company_id FROM integrations.samsara_config WHERE is_enabled = true`
            );
            for (const row of res.rows) {
              const oc = row.operating_company_id;
              await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
              await syncSamsaraDriversMaster(client, oc);
              await syncSamsaraVehiclesMaster(client, oc);
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Samsara master sync cron scheduled (hourly at :30, America/Chicago)");
}
