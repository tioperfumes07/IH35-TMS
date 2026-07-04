// RECON-01 cron entrypoint. Invoked by the two Render cron entries:
//   node dist/accounting/recon/run-recon.js am   (06:00 CT bank-count)
//   node dist/accounting/recon/run-recon.js pm   (19:00 CT categorization-diff)
// Read-only; a no-op for any entity whose TMS_QBO_RECON_ENABLED flag is OFF (default).
// G10-C3 / G4-HEALTH: init Sentry so uncaught cron failures report, and run through
// wrapBackgroundJobTick so every run records a _system.background_jobs row (→ /healthz staleness).
import { initBackendSentry } from "../../lib/sentry.js";
import { wrapBackgroundJobTick } from "../../lib/background-jobs.js";
import { reconJobName, runReconTick } from "./recon-cron.service.js";

initBackendSentry();

async function main() {
  const arg = process.argv[2];
  if (arg !== "am" && arg !== "pm") {
    console.error(`[recon-cron] usage: run-recon <am|pm> — got ${JSON.stringify(arg)}`);
    process.exitCode = 1;
    return;
  }
  await wrapBackgroundJobTick(
    reconJobName(arg),
    async () => {
      const result = await runReconTick(arg);
      console.log("[recon-cron]", JSON.stringify(result));
    },
    undefined,
    {
      onError: () => {
        process.exitCode = 1;
      },
    }
  );
}

main().catch((error) => {
  console.error("[recon-cron] failed", error);
  process.exitCode = 1;
});
