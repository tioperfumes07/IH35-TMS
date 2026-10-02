/**
 * ENGINE: geofence odometer captures
 * SCHEDULE: *\/10 * * * *
 * WRITES: telematics geofence odometer captures
 * IDEMPOTENCY: UNIQUE(geofence_event_id) ON CONFLICT DO NOTHING (geofence-odometer-capture.service.ts)
 * OVERLAP: second run inserts 0 rows
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { captureGeofenceOdometerEvents, getGeofenceOdometerCaptureStatus } from "../integrations/samsara/geofences/geofence-odometer-capture.service.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CRON_NAME = "telematics.geofence_odometer_captures";
let initialized = false;

export function initializeGeofenceOdometerCapturesCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  cron.schedule("*/10 * * * *", async () => {
    await wrapBackgroundJobTick(CRON_NAME, async () => {
      assertTenantContext(USMCA_COMPANY_ID, CRON_NAME);
      const rows = await withLuciaBypass((client) => captureGeofenceOdometerEvents(client, {
        operatingCompanyId: USMCA_COMPANY_ID,
      }));
      const status = await withLuciaBypass((client) => getGeofenceOdometerCaptureStatus(client, USMCA_COMPANY_ID));
      app.log.info(
        { operating_company_id: USMCA_COMPANY_ID, captures_written: rows.length, ...status },
        `${CRON_NAME} complete`
      );
    }, app.log);
  }, { timezone: "America/Chicago", maxRandomDelay: 20_000 });
  app.log.info(`${CRON_NAME} scheduled (every 10 minutes, America/Chicago)`);
}
