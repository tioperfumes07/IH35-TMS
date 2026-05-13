import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { runSamsaraHealthCheckForRow } from "../integrations/samsara/samsara.service.js";

let initialized = false;

export function initializeSamsaraHealthCheckCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_SAMSARA_HEALTH_CHECK_CRON === "false") {
    app.log.info("Samsara health cron disabled via ENABLE_SAMSARA_HEALTH_CHECK_CRON=false");
    return;
  }

  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        await withLuciaBypass(async (client) => {
          const res = await client.query<{ operating_company_id: string }>(
            `SELECT operating_company_id::text AS operating_company_id FROM integrations.samsara_config WHERE is_enabled = true`
          );
          for (const row of res.rows) {
            const oc = row.operating_company_id;
            await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
            await runSamsaraHealthCheckForRow(client, oc);
          }
        });
      } catch (err) {
        app.log.error({ err }, "samsara health cron failed");
      }
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Samsara health cron scheduled (hourly, America/Chicago)");
}
