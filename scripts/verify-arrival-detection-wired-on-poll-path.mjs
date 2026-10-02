#!/usr/bin/env node
/**
 * ROUND 303 T-40 — GUARD (re-anchored 2026-10-02, CC-3 queue 6 — ONE arrival detector).
 * FAILS IF the poll paths stop counting the fence detector's stamped arrivals, or the webhook projector stops prompting
 * the driver from that same fence event (it used to call the retired 250 ft detector for the prompt).
 * Contract: scripts/lib/one-arrival-detector.mjs.
 */
import { PATHS, read, checkPollPathCountsFenceArrivals, checkProjectorPromptsFromFence, mutations, report } from "./lib/one-arrival-detector.mjs";

const LABEL = "verify-arrival-detection-wired-on-poll-path";
const cron = read(PATHS.cron);
const projector = read(PATHS.projector);
report(LABEL, [...checkPollPathCountsFenceArrivals(cron), ...checkProjectorPromptsFromFence(projector)], process.argv.includes("--selftest") && {
  name: "webhook prompt",
  run: () => mutations(checkProjectorPromptsFromFence, [
    ["drop the prompt", projector.replace("notifyDriver: notifyDriverWebPush", "")],
    ["re-add the 250 ft detector", projector + "\nawait processArrivalDetectionsForGpsPoint(client, input);"],
  ]),
});
