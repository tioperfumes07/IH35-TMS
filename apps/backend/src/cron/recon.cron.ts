import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { reconJobName, runReconTick } from "../accounting/recon/recon-cron.service.js";

// In-process twice-daily reconciler. Mirrors loves-card-import.cron.ts EXACTLY: node-cron with an
// America/Chicago timezone so the CT schedule is expressed directly (no manual UTC offset math), and each
// tick wrapped in wrapBackgroundJobTick under the canonical reconJobName so every run records
// _system.background_jobs (→ /healthz staleness / Sentry) — the SAME ledger the standalone Render cron
// entrypoint (run-recon.ts) writes, so a run from either path is interchangeable and dedupe-visible on the
// job ledger. Read-only per entity whose TMS_QBO_RECON_ENABLED flag is ON; a no-op otherwise. ADDITIVE —
// this touches NEITHER the recon engine, the recon tables, run-recon.ts, nor any accounting SQL; it only
// SCHEDULES the already-built runReconTick so the reconciler runs without depending on a Render cron service.
let initialized = false;
const AM_EXPRESSION = "0 6 * * *"; // 06:00 CT — bank-count pass (Render: "0 12 * * *" UTC)
const PM_EXPRESSION = "0 19 * * *"; // 19:00 CT — categorization-diff pass (Render: "0 1 * * *" UTC)
const CRON_TZ = "America/Chicago";

export function initializeReconCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.RECON_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("Recon cron disabled via RECON_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    AM_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        reconJobName("am"),
        async () => {
          await runReconTick("am");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );

  cron.schedule(
    PM_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        reconJobName("pm"),
        async () => {
          await runReconTick("pm");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );

  app.log.info("Recon cron scheduled (AM 06:00 + PM 19:00 America/Chicago)");
}
