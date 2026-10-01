/**
 * ROUND 306 E-21 / E-22 — what runs when fuel rows arrive.
 *
 * The fraud detector used to run every 15 minutes and the fuel<->GPS match every hour, over every
 * company, re-reading the same rows (owner D-02). Both only have something new to do when a fuel
 * ingest completes, so they now run here, once, for the companies the ingest touched:
 *   the fraud detector (still behind ENABLE_FUEL_FRAUD_DETECTOR_WORKER, default OFF).
 * The fuel<->GPS verdict (E-22) is computed on read in fuel/fuel-gps-verdict.service.ts — it no
 * longer writes on a schedule, because the old bank-line matcher could only guess.
 * Callers: the Loves card import cron (daily — its pass over all companies doubles as the sweep
 * for manually entered rows) and the fuel statement upload route.
 * Each step is recorded in _system.background_jobs under its existing job name.
 */
import type { FastifyBaseLogger } from "fastify";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { withLuciaBypass } from "../auth/db.js";
import { writeFuelTimeDerivations } from "./fuel-time-derivation.service.js";
import {
  FUEL_FRAUD_DETECTOR_JOB,
  fuelFraudDetectorEnabled,
  runFuelFraudDetectorTick,
} from "../jobs/fuel-fraud-detector-worker.js";

export async function onFuelIngestComplete(
  log: FastifyBaseLogger,
  source: "loves_card_import" | "fuel_statement_upload",
  companyIds?: string[]
): Promise<void> {
  // ORDERS-2026-10-01 rows 5-6: derive pump time + IFTA state for date-only rows (own output table).
  await wrapBackgroundJobTick(
    "fuel.time_derivation",
    async () => {
      const companies = companyIds ?? (await withLuciaBypass(async (client) =>
        (await client.query<{ id: string }>(`SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL`)).rows.map((r) => r.id)));
      for (const id of companies) {
        const res = await withLuciaBypass(async (client) => {
          await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [id]);
          return writeFuelTimeDerivations(client, id);
        });
        log.info({ operating_company_id: id, ...res, source }, "[FUEL_INGEST_HOOK] fuel time derivation");
      }
    },
    log
  );

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
