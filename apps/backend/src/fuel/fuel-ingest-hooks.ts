/**
 * ROUND 306 E-21 / E-22 — what runs when fuel rows arrive.
 *
 * The fraud detector used to run every 15 minutes and the fuel<->GPS match every hour, over every
 * company, re-reading the same rows (owner D-02). Both only have something new to do when a fuel
 * ingest completes, so they now run here, once, for the companies the ingest touched:
 *   the fill engine on every fill not yet through it (E9 / ENG-64 — fuel/fuel-follows-truck-sweep.ts);
 *   the fraud detector (still behind ENABLE_FUEL_FRAUD_DETECTOR_WORKER, default OFF).
 * The fuel<->GPS verdict (E-22) is computed on read in fuel/fuel-gps-verdict.service.ts — it no
 * longer writes on a schedule, because the old bank-line matcher could only guess.
 * Callers: the Loves card import cron (daily — its pass over all companies doubles as the sweep
 * for manually entered rows) and the fuel statement upload route.
 * Each step is recorded in _system.background_jobs under its existing job name.
 */
import type { FastifyBaseLogger } from "fastify";
import { JOB_LEASE_SECONDS, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { withLuciaBypass } from "../auth/db.js";
import { writeFuelTimeDerivations } from "./fuel-time-derivation.service.js";
import { runFuelFollowsTruckSweep } from "./fuel-follows-truck-sweep.js";
import { listRelayFillDocumentsWithoutRecords, recordAndLinkRelayFillDocument } from "./fuel-expense-document.service.js";
import { SYSTEM_ACTOR_USER_ID } from "../lib/system-actor.js";
import { rematchRelayFuelDrivers } from "../integrations/relay-payments/relay-fuel-driver-rematch.service.js";
import { isUsmcaOperatingCompany } from "../integrations/relay-payments/relay-usmca-date-floor.js";
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

  // E1 (row 162): every Relay fill without a driver goes through the one Relay driver matcher (Relay's own id, directly or
  // through integrations.relay_driver_links; then the fuel row; then the load at fill time). NULL only, audited. Relay fills
  // are stored for USMCA only (ROUND 443.15), so only USMCA is touched. Runs BEFORE the Relay fill records so a new record
  // carries the fill's driver.
  await wrapBackgroundJobTick(
    "relay.fill_driver_match",
    async () => {
      const companies = (companyIds ?? (await withLuciaBypass(async (client) =>
        (await client.query<{ id: string }>(`SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL`)).rows.map((r) => r.id))))
        .filter((id) => isUsmcaOperatingCompany(id));
      for (const id of companies) {
        const res = await withLuciaBypass(async (client) => {
          await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [id]);
          return rematchRelayFuelDrivers(client as never, { operating_company_id: id, actor_user_id: SYSTEM_ACTOR_USER_ID });
        });
        log.info({ operating_company_id: id, ...res, source }, "[FUEL_INGEST_HOOK] relay fill driver match");
      }
    },
    log,
    { leaseSeconds: JOB_LEASE_SECONDS }
  );

  // ENG-65: every Relay fill document whose fill has no fuel record — the fill is recorded from its own Relay lines on the
  // document's load / driver / truck and the document linked, one fill per transaction. Runs BEFORE the fill engine so the
  // new records go through it in the same pass. A fill that cannot be recorded honestly is named and fails the run.
  await wrapBackgroundJobTick(
    "fuel.relay_fill_records",
    async () => {
      // Relay fills are stored for USMCA only (ROUND 443.15); never run this writer for a frozen entity.
      const companies = (companyIds ?? (await withLuciaBypass(async (client) =>
        (await client.query<{ id: string }>(`SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL`)).rows.map((r) => r.id))))
        .filter((id) => isUsmcaOperatingCompany(id));
      const refused: string[] = [];
      for (const id of companies) {
        const docs = await withLuciaBypass(async (client) => {
          await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [id]);
          return listRelayFillDocumentsWithoutRecords(client as never, id);
        });
        const tally: Record<string, number> = {};
        for (const d of docs) {
          const r = await withLuciaBypass(async (client) => {
            await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [id]);
            return recordAndLinkRelayFillDocument(client as never, { operating_company_id: id, ...d, actor_user_uuid: SYSTEM_ACTOR_USER_ID });
          });
          tally[r.outcome] = (tally[r.outcome] ?? 0) + 1;
          if (r.outcome !== "linked") refused.push(`${d.relay_fill_id}: ${r.reason}`);
        }
        log.info({ operating_company_id: id, documents: docs.length, ...tally, source }, "[FUEL_INGEST_HOOK] relay fill records");
      }
      if (refused.length) throw new Error(`relay_fill_records_refused (${refused.length}): ${refused.slice(0, 5).join(" | ")}`);
    },
    log,
    { leaseSeconds: JOB_LEASE_SECONDS }
  );

  // E9 (ENG-64): every fill not yet through the one fill engine goes through it now (fuel follows the truck at the pump;
  // owner rulings untouched; not-certain fills become assignment questions). A fill the engine could not apply is reported
  // and fails the job run — never swallowed.
  await wrapBackgroundJobTick(
    "fuel.follows_truck",
    async () => {
      // USMCA only (11-04, measured): the unscoped list ran the engine for IH 35 Transportation (frozen) and opened 1,631
      // assignment questions there. The engine never touches a frozen entity.
      const companies = (companyIds ?? (await withLuciaBypass(async (client) =>
        (await client.query<{ id: string }>(`SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL`)).rows.map((r) => r.id))))
        .filter((id) => isUsmcaOperatingCompany(id));
      const failed: string[] = [];
      for (const id of companies) {
        const res = await runFuelFollowsTruckSweep(id);
        log.info({ ...res, source }, "[FUEL_INGEST_HOOK] fuel follows truck");
        if (res.failed > 0) failed.push(`${id}: ${res.failed} (${res.failures.slice(0, 3).map((f) => `${f.fuel_id} ${f.error}`).join("; ")})`);
      }
      if (failed.length) throw new Error(`fuel_follows_truck_refused: ${failed.join(" | ")}`);
    },
    log,
    // two instances run this hook (run_count_today 2 on fuel.time_derivation, 11-03): one holder moves fills, never both.
    { leaseSeconds: JOB_LEASE_SECONDS }
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
