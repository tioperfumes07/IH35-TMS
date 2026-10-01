// ROUND 313 — one catch-up pass of the fuel fraud detector over every live fuel row not yet alerted (the detector's
// window used to be purchase date, so imported statements were never evaluated). Same engine, same two-signal
// classification, same alert writer. Render one-off job:  node dist/sync/run-fuel-fraud-backlog.js [company_id ...]
import { initBackendSentry } from "../lib/sentry.js";
import { runFuelFraudDetectorTick } from "../jobs/fuel-fraud-detector-worker.js";

initBackendSentry();
const ids = process.argv.slice(2).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
runFuelFraudDetectorTick(ids.length ? ids : undefined, { backlog: true })
  .then((summary) => {
    console.log("[fuel-fraud-backlog]", JSON.stringify(summary));
    process.exit(0);
  })
  .catch((error) => {
    console.error("[fuel-fraud-backlog] failed", error);
    process.exit(1);
  });
