/**
 * ROUND 306 E-21 / E-22 — what runs when fuel rows arrive.
 *
 * The fraud detector used to run every 15 minutes and the fuel<->GPS match every hour, over every
 * company, re-reading the same rows (owner D-02). Both only have something new to do when a fuel
 * ingest completes, so they now run here, once, for the companies the ingest touched:
 *   1. fuel <-> GPS match first — it attaches the unit/driver the fraud rules read;
 *   2. then the fraud detector (still behind ENABLE_FUEL_FRAUD_DETECTOR_WORKER, default OFF).
 * Callers: the Loves card import cron (daily — its pass over all companies doubles as the sweep
 * for manually entered rows) and the fuel statement upload route.
 * Each step is recorded in _system.background_jobs under its existing job name.
 */
import type { FastifyBaseLogger } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runFuelGpsMatchBatch } from "../safety/fuel-gps-match.service.js";
import {
  FUEL_FRAUD_DETECTOR_JOB,
  fuelFraudDetectorEnabled,
  runFuelFraudDetectorTick,
} from "../jobs/fuel-fraud-detector-worker.js";

export const FUEL_GPS_MATCH_JOB = "safety.fuel_gps_match_cron";

export async function onFuelIngestComplete(
  log: FastifyBaseLogger,
  source: "loves_card_import" | "fuel_statement_upload",
  companyIds?: string[]
): Promise<void> {
  if ((process.env.FUEL_GPS_MATCH_CRON_ENABLED ?? "true").trim() !== "false") {
    await wrapBackgroundJobTick(
      FUEL_GPS_MATCH_JOB,
      async () => {
        await withLuciaBypass(async (client) => {
          const companies = await client.query<{ id: string }>(
            `SELECT id::text AS id FROM org.companies
              WHERE is_active = true AND deactivated_at IS NULL
                AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
              ORDER BY id`,
            [companyIds ?? null]
          );
          for (const company of companies.rows) {
            assertTenantContext(company.id, FUEL_GPS_MATCH_JOB);
            await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
            const matched = await runFuelGpsMatchBatch(client, company.id);
            log.info({ operating_company_id: company.id, matched, source }, "[FUEL_INGEST_HOOK] fuel<->GPS match complete");
          }
        });
      },
      log
    );
  }

  if (fuelFraudDetectorEnabled()) {
    await wrapBackgroundJobTick(
      FUEL_FRAUD_DETECTOR_JOB,
      async () => {
        const summary = await runFuelFraudDetectorTick(companyIds);
        log.info({ summary, source }, "[FUEL_INGEST_HOOK] fraud detection complete");
      },
      log
    );
  }
}
