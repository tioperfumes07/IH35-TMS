import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { JOB_LEASE_SECONDS, recordBackgroundJobDisabled, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { USMCA_COMPANY_ID } from "../org/company-ids.js";
import { runIntegrityAlertEngineForTenant } from "./integrity-alert-engine.service.js";

/**
 * ENG-7D watchdog — standing order point 9 (single-fire).
 * Two Render instances both schedule this cron. Without { leaseSeconds }, both would
 * upsert the same bank_unmatched_7d digest and notify Owners twice every 6h.
 * leaseSeconds → withJobLease: one holder runs; the other skips.
 *
 * HEALTHZ-INTEGRITY-MEGA-TXN (2026-10-08): the prior tick opened ONE withLuciaBypass
 * across every active company and awaited notifyOwners inside that txn. Dual-instance
 * catch-up then deadlocked on integrity_alert_rules INSERT, left idle-in-transaction
 * clients on ClientRead, and starved /healthz critical ledger checks (8s timeouts →
 * full healthz hang). USMCA-only + one short txn. Notify is fire-and-forget in the
 * service (must not hold the bypass client).
 */
const CRON_NAME = "safety.integrity_alert_engine_cron";

let initialized = false;

export async function runIntegrityAlertEngineCronTick() {
  assertTenantContext(USMCA_COMPANY_ID, CRON_NAME);
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
    await runIntegrityAlertEngineForTenant(client, USMCA_COMPANY_ID);
  });
}

export function initializeIntegrityAlertEngineCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_INTEGRITY_ALERT_ENGINE_CRON === "false") {
    app.log.info("Integrity alert engine cron disabled via ENABLE_INTEGRITY_ALERT_ENGINE_CRON=false");
    recordBackgroundJobDisabled(CRON_NAME).catch((err) =>
      app.log.warn({ err }, `[background-job:${CRON_NAME}] failed to record disabled-outcome`)
    );
    return;
  }

  cron.schedule(
    "20 */6 * * *",
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          await runIntegrityAlertEngineCronTick();
        },
        app.log,
        { leaseSeconds: JOB_LEASE_SECONDS }
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Integrity alert engine cron scheduled (every 6h at :20 America/Chicago)");
}
