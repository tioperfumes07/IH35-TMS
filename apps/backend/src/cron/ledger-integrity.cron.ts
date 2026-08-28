import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runLedgerIntegrityTick } from "../reconciliation/ledger-integrity-detectors.service.js";

// LAUNCH-SAFE-LEDGER-MONITOR-DETECTORS — job name is the literal "ledger.integrity_cron" named in
// CURSOR-VERIFY-MASTER-LAUNCH-PLAN-2026-08-28.md §1/§3. Mirrors recon.cron.ts / reconciliation-
// worker.cron.ts: node-cron with an America/Chicago timezone, maxRandomDelay jitter (see PROD-
// OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED), every tick wrapped in wrapBackgroundJobTick under
// the canonical job name so a run records _system.background_jobs (→ /healthz staleness / Sentry)
// — FAIL-FIRST: a genuine detector error is caught by wrapBackgroundJobTick, recorded as a failed
// run (visible on /healthz + Sentry) on the very next tick, never silently swallowed into a green
// no-op. Read-only against accounting.* — no GL/posting logic touched.
let initialized = false;
const EXPRESSION = "20 * * * *"; // hourly, :20 past — staggered off the QBO transactional :45 tick
const CRON_TZ = "America/Chicago";
export const LEDGER_INTEGRITY_JOB_NAME = "ledger.integrity_cron";

export function initializeLedgerIntegrityCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.LEDGER_INTEGRITY_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("Ledger integrity cron disabled via LEDGER_INTEGRITY_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        LEDGER_INTEGRITY_JOB_NAME,
        async () => {
          await withLuciaBypass(async (client) => {
            await runLedgerIntegrityTick(client);
          });
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );

  app.log.info("Ledger integrity cron scheduled (hourly :20 America/Chicago)");
}
