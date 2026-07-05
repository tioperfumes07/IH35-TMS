// Love's fuel-card import cron entrypoint. Invoked by the Render cron `loves-card-import`:
//   node dist/sync/run-loves-card-import.js
// G10-C3 / G4-HEALTH: init Sentry so uncaught cron failures report, and run through
// wrapBackgroundJobTick so every run records a _system.background_jobs row (→ /healthz staleness).
import { initBackendSentry } from "../lib/sentry.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { LOVES_CARD_IMPORT_JOB, runLovesCardImportTick } from "./loves-card-import.js";

initBackendSentry();

async function main() {
  await wrapBackgroundJobTick(
    LOVES_CARD_IMPORT_JOB,
    async () => {
      const result = await runLovesCardImportTick();
      console.log("[loves-card-import]", JSON.stringify(result));
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
  console.error("[loves-card-import] failed", error);
  process.exitCode = 1;
});
