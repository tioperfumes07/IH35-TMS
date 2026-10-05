import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { JOB_LEASE_SECONDS, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runIntegrityAlertEngineForTenant } from "./integrity-alert-engine.service.js";

/**
 * ENG-7D watchdog — standing order point 9 (single-fire).
 * Two Render instances both schedule this cron. Without { leaseSeconds }, both would
 * upsert the same bank_unmatched_7d digest and notify Owners twice every 6h.
 * leaseSeconds → withJobLease: one holder runs; the other skips.
 */
const CRON_NAME = "safety.integrity_alert_engine_cron";

let initialized = false;

export async function runIntegrityAlertEngineCronTick() {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );
    for (const company of companies.rows) {
      assertTenantContext(String(company.id ?? ""), CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      await runIntegrityAlertEngineForTenant(client, company.id);
    }
  });
}

export function initializeIntegrityAlertEngineCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_INTEGRITY_ALERT_ENGINE_CRON === "false") {
    app.log.info("Integrity alert engine cron disabled via ENABLE_INTEGRITY_ALERT_ENGINE_CRON=false");
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
