/**
 * GAP-59 / CAP-9 — Hourly Samsara vehicle-driver pairing sync worker.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import {
  OVERLAP_STOP_THRESHOLD_RATIO,
  syncFromSamsara,
  type SyncFromSamsaraResult,
} from "../integrations/samsara/vehicle-driver-pairing/pairing.service.js";

let initialized = false;

const CRON_EXPRESSION = "0 * * * *";
const CRON_TZ = "America/Chicago";
const CRON_NAME = "samsara.vehicle_driver_pairing_sync";

export type VehicleDriverPairingTickSummary = {
  companies_processed: number;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  overlap_flags_created: number;
  overlap_stop_triggered: boolean;
  company_results: Array<{ operating_company_id: string; result: SyncFromSamsaraResult }>;
};

export async function runVehicleDriverPairingWorkerTick(): Promise<VehicleDriverPairingTickSummary> {
  const summary: VehicleDriverPairingTickSummary = {
    companies_processed: 0,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    overlap_flags_created: 0,
    overlap_stop_triggered: false,
    company_results: [],
  };

  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `
        SELECT c.id::text AS id
        FROM org.companies c
        JOIN integrations.samsara_config sc ON sc.operating_company_id = c.id
        WHERE c.is_active = true
          AND c.deactivated_at IS NULL
          AND sc.is_enabled = true
        ORDER BY c.id
        LIMIT 200
      `
    );

    for (const company of companies.rows) {
      assertTenantContext(company.id, CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [company.id]);

      const result = await syncFromSamsara(client, company.id);
      summary.companies_processed += 1;
      summary.fetched += result.fetched;
      summary.inserted += result.inserted;
      summary.updated += result.updated;
      summary.skipped += result.skipped;
      summary.overlap_flags_created += result.overlap_flags_created;
      if (result.overlap_stop_triggered) summary.overlap_stop_triggered = true;
      summary.company_results.push({ operating_company_id: company.id, result });

      if (result.overlap_ratio > OVERLAP_STOP_THRESHOLD_RATIO) {
        throw new Error(
          `vehicle_driver_pairing_overlap_stop: oci=${company.id} ratio=${result.overlap_ratio.toFixed(4)} threshold=${OVERLAP_STOP_THRESHOLD_RATIO}`
        );
      }
    }
  });

  return summary;
}

export function initializeVehicleDriverPairingWorker(app: FastifyInstance): void {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_VEHICLE_DRIVER_PAIRING_WORKER === "false") {
    app.log.info("Vehicle-driver pairing worker disabled via ENABLE_VEHICLE_DRIVER_PAIRING_WORKER=false");
    return;
  }

  const schedule = process.env.VEHICLE_DRIVER_PAIRING_CRON ?? CRON_EXPRESSION;

  cron.schedule(
    schedule,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const summary = await runVehicleDriverPairingWorkerTick();
          app.log.info({ summary }, "[vehicle-driver-pairing-worker] tick complete");
        },
        app.log
      );
    },
    { timezone: CRON_TZ }
  );

  app.log.info(`[STARTUP] ${CRON_NAME} initialized (schedule="${schedule}")`);
}
