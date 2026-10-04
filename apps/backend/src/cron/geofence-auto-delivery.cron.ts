/**
 * ENGINE: geofence auto-delivery (load status on final-stop arrival)
 * SCHEDULE: 11,26,41,56 * * * *
 * WRITES: mdata.loads.status + transition side effects (dispatch/load-transition.service.ts)
 * IDEMPOTENCY: SAME-STATEMENT WHERE status::text = $expected after SELECT ... FOR UPDATE (load-transition.service.ts)
 * OVERLAP: second run's UPDATE matches 0 rows and returns status_changed; no side effects repeat
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * ROUND 315 — auto-status, geofence-evidence path (dispatch/geofence-auto-delivery.service.ts).
 * Every 15 min America/Chicago (offset :11/:26/:41/:56, after the stop writer's :07 tick). One transaction PER
 * LOAD so each delivery's after-commit work (revenue latch + invoice) runs on its own commit and one refusal
 * never blocks the rest. Writes only with AUTO_DELIVERY_FROM_GEOFENCE_APPLY=true; otherwise it lists the
 * candidates it would deliver and writes nothing.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { autoDeliverLoad, geofenceAutoDeliveryEnabled, listGeofenceDeliveredLoads } from "../dispatch/geofence-auto-delivery.service.js";

import { USMCA_COMPANY_ID } from "../org/company-ids.js";
const CRON_NAME = "dispatch.geofence_auto_delivery";
let initialized = false;

export async function runGeofenceAutoDeliveryTick(operatingCompanyId = USMCA_COMPANY_ID) {
  const candidates = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return listGeofenceDeliveredLoads(client as never, operatingCompanyId);
  });
  if (!geofenceAutoDeliveryEnabled()) return { applied: false, candidates: candidates.map((c) => c.load_number) };
  const results = [];
  for (const c of candidates) {
    try {
      results.push(
        await withLuciaBypass(async (client) => {
          await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
          return autoDeliverLoad(client as never, operatingCompanyId, c);
        })
      );
    } catch (err) {
      results.push({ load_number: c.load_number, error: String((err as Error)?.message ?? err) });
    }
  }
  return { applied: true, results };
}

export function initializeGeofenceAutoDeliveryCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  cron.schedule("11,26,41,56 * * * *", async () => {
    await wrapBackgroundJobTick(CRON_NAME, async () => {
      assertTenantContext(USMCA_COMPANY_ID, CRON_NAME);
      const summary = await runGeofenceAutoDeliveryTick();
      app.log.info(summary, `${CRON_NAME} complete`);
    }, app.log);
  }, { timezone: "America/Chicago", maxRandomDelay: 15_000 });
  app.log.info(`${CRON_NAME} scheduled (every 15 min; writes only with AUTO_DELIVERY_FROM_GEOFENCE_APPLY=true)`);
}
