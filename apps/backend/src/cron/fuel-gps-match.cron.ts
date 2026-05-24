import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { runFuelGpsMatchBatch } from "../safety/fuel-gps-match.service.js";

let initialized = false;

export function initializeFuelGpsMatchCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.FUEL_GPS_MATCH_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("Fuel GPS match cron disabled via FUEL_GPS_MATCH_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    "0 * * * *",
    async () => {
      await withLuciaBypass(async (client) => {
        const companies = await client.query<{ id: string }>(
          `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
        );
        for (const company of companies.rows) {
          await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [company.id]);
          const matched = await runFuelGpsMatchBatch(client, company.id);
          app.log.info({ operating_company_id: company.id, matched }, "[FUEL_GPS_MATCH_CRON] run complete");
        }
      });
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Fuel GPS match cron scheduled (hourly)");
}
