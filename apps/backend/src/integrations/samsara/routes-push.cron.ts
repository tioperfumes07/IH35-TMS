/**
 * ENGINE: Samsara routes push + read-back
 * SCHEDULE: *\/15 * * * *
 * WRITES: external Samsara routes, integration_sync_log, mdata.loads.samsara_route_id, route stop progress
 * IDEMPOTENCY: ADVISORY LOCK pg_try_advisory_xact_lock for the tick; route id SAME-STATEMENT WHERE IS DISTINCT FROM; UNIQUE(load_id, stop_id) ON CONFLICT on stop progress
 * OVERLAP: an overlapping replica fails the lock and pushes nothing
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * ROUND 306 E-31 — push dispatched loads to Samsara as Routes, every 15 min (America/Chicago).
 * Off unless SAMSARA_ROUTES_PUSH_ENABLED=true. Each load is sent only when its body changed
 * (hash ledger in integrations.integration_sync_log). USMCA only (operating rule 1).
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../../auth/db.js";
import { tryXactSingleFlight } from "../../lib/single-flight.js";
import { assertTenantContext } from "../../cron/_helpers/tenant-context-guard.js";
import { pushAllChangedRoutes, readBackSamsaraRoutes, samsaraRouteApiFor, samsaraRoutesPushEnabled } from "./routes-integration.service.js";

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
          // ROUND 329: body-hash read -> Samsara route push -> ledger INSERT is read-then-write; the DB lock makes
          // one tick push, an overlapping replica skips.
          if (!(await tryXactSingleFlight(client, `samsara.routes_push:${USMCA_COMPANY_ID}`))) return { skipped: "locked" as const, results: [] };
          const push = await pushAllChangedRoutes(client as never, USMCA_COMPANY_ID);
          // E-31 read-back on the same tick: state / ETA / actuals per stop for every routed load
          const readBack = await readBackSamsaraRoutes(client as never, USMCA_COMPANY_ID, await samsaraRouteApiFor(client as never, USMCA_COMPANY_ID));
          return { ...push, read_back: readBack };
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
