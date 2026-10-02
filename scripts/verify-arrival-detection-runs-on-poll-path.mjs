#!/usr/bin/env node
/**
 * GUARD (re-anchored 2026-10-02, CC-3 queue 6 — ONE arrival detector): arrivals are detected on the CRON/POLL path, the
 * only feed that runs (Samsara webhooks have never delivered). Both poll paths run the geofence detector on every
 * persisted point and count the load stops it stamped (arrivals_triggered = stop_arrivals_stamped); the retired 250 ft
 * detector is never called. Contract: scripts/lib/one-arrival-detector.mjs.
 * Usage: node scripts/verify-arrival-detection-runs-on-poll-path.mjs [--selftest]
 */
import { PATHS, read, checkPollPathCountsFenceArrivals, mutations, report } from "./lib/one-arrival-detector.mjs";

const LABEL = "verify-arrival-detection-runs-on-poll-path";
const cron = read(PATHS.cron);
report(LABEL, checkPollPathCountsFenceArrivals(cron), process.argv.includes("--selftest") && {
  name: "poll path",
  run: () => mutations(checkPollPathCountsFenceArrivals, [
    ["drop one fence call", cron.replace("processGeofenceDetectionsForGpsPoint(", "skipFence(")],
    ["stop counting arrivals", cron.replace(".stop_arrivals_stamped", ".transitions_written")],
    ["re-add the 250 ft detector", cron + "\nawait detectArrivalsForIngestedPoint(client, input, errors);"],
  ]),
});
