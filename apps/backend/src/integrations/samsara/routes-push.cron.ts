/**
 * ROUND 306 E-31 — push dispatched loads to Samsara as Routes, every 15 min (America/Chicago).
 * Off unless SAMSARA_ROUTES_PUSH_ENABLED=true. Each load is sent only when its body changed
 * (hash ledger in integrations.integration_sync_log). USMCA only (operating rule 1).
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../../auth/db.js";
import { assertTenantContext } from "../../cron/_helpers/tenant-context-guard.js";
import { pushAllChangedRoutes, samsaraRoutesPushEnabled } from "./routes-integration.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CRON_NAME = "integrations.samsara_routes_push";
let initialized = false;

export function initializeSamsaraRoutesPushCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (!samsaraRoutesPushEnabled()) {
    app.log.info(`${CRON_NAME} not scheduled: SAMSARA_ROUTES_PUSH_ENABLED is not true (plan: GET /api/v1/integrations/samsara/routes/plan)`);
    return;
  }
  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        assertTenantContext(USMCA_COMPANY_ID, CRON_NAME);
        const summary = await withLuciaBypass(async (client) => {
          // membership-scope-exempt: internally-scoped single entity
          await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
          return pushAllChangedRoutes(client as never, USMCA_COMPANY_ID);
        });
        app.log.info({ ...summary, results: summary.results.length }, `${CRON_NAME} tick`);
      } catch (error) {
        app.log.error({ err: error }, `[${CRON_NAME}] tick failed`);
        throw error;
      }
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );
  app.log.info(`${CRON_NAME} scheduled (every 15 min, America/Chicago)`);
}
