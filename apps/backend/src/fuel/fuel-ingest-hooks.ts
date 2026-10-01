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
