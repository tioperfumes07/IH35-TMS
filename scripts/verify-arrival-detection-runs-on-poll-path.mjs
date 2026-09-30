#!/usr/bin/env node
/**
 * GUARD: arrival detection must run on the CRON/POLLING path, not only on the webhook.
 *
 * WHY (T-01, measured live on br-fancy-credit-akjnd07a 2026-09-30):
 *   dispatch.stop_arrivals                     0 rows, EVER
 *   integrations.samsara_webhook_events        0 rows, EVER
 *   telematics.vehicle_locations         828,445 rows, newest seconds old
 *   all 16 open USMCA loads status='dispatched', newest status write 2026-09-28
 *
 * processArrivalDetectionsForGpsPoint had EXACTLY ONE caller: the Samsara webhook projector. That
 * projector fires only on webhook events, and this account has never delivered one. So the engine
 * that advances a load through its stops never executed against a single GPS point in its life --
 * while the cron path ingested 828,445 of them and called only the GEOFENCE detector sitting right
 * beside it.
 *
 * That is why every truck on the Truck Line sits on "Dispatched". The board was honest; the engine
 * was never wired to the feed that actually runs.
 *
 * THE RULE: wherever the cron path persists a GPS point and calls the geofence detector, it must
 * call arrival detection too. A detector wired to a feed that never fires is not a detector.
 *
 * Usage:  node scripts/verify-arrival-detection-runs-on-poll-path.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-arrival-detection-runs-on-poll-path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CRON = "apps/backend/src/integrations/samsara/samsara-positions.service.ts";

export function assertArrivalDetectionOnPollPath(src) {
  const problems = [];

  if (!/processArrivalDetectionsForGpsPoint/.test(src)) {
    problems.push(
      `${CRON}: the cron ingest path does not reference processArrivalDetectionsForGpsPoint at all. ` +
        `Arrival detection would again run ONLY on the Samsara webhook, which this account has never ` +
        `delivered -- dispatch.stop_arrivals sat at 0 rows for the engine's entire life because of exactly this.`
    );
    return problems;
  }

  // Every place the cron calls the geofence detector must also detect arrivals: they are the two
  // halves of "something happened at this point", and they take identical inputs.
  const geofenceCalls = (src.match(/processGeofenceDetectionsForGpsPoint\(/g) || []).length;
  const arrivalCalls = (src.match(/detectArrivalsForIngestedPoint\(/g) || []).length;
  // one definition + one call per ingest path
  if (arrivalCalls < geofenceCalls + 1) {
    problems.push(
      `${CRON}: ${geofenceCalls} geofence-detector call site(s) but only ${arrivalCalls - 1} arrival-detection ` +
        `call site(s). Every cron path that persists a GPS point must detect arrivals on it -- a path that ` +
        `detects geofences and not arrivals is how a load stops advancing while the map keeps moving.`
    );
  }

  if (!/async function detectArrivalsForIngestedPoint/.test(src)) {
    problems.push(`${CRON}: the detectArrivalsForIngestedPoint helper is gone.`);
  }

  // It must be isolated: a detection failure may never take position ingest down.
  const helper = src.match(/async function detectArrivalsForIngestedPoint[\s\S]*?\n\}/);
  if (helper) {
    if (!/try \{/.test(helper[0]) || !/catch \(error\)/.test(helper[0])) {
      problems.push(
        `${CRON}: detectArrivalsForIngestedPoint no longer isolates its failure. Positions are the live map; ` +
          `arrivals are derived. A derived signal must never take the feed down with it.`
      );
    }
    if (!/errors\.push\(/.test(helper[0])) {
      problems.push(
        `${CRON}: detectArrivalsForIngestedPoint swallows its error instead of recording it. Silence is what let ` +
          `this engine stay dead without a single error anywhere.`
      );
    }
  }

  // The count must be surfaced, or a dead engine is invisible again.
  if (!/arrivals_triggered/.test(src)) {
    problems.push(
      `${CRON}: the run no longer reports arrivals_triggered. A run that ingests hundreds of points and triggers ` +
        `zero arrivals forever is precisely how this went unnoticed -- the number has to be written down.`
    );
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, CRON), "utf8");

if (process.argv.includes("--selftest")) {
  const failures = [];
  const good = read();
  const expect = (name, src, needle) => {
    const problems = assertArrivalDetectionOnPollPath(src);
    if (!problems.some((p) => p.includes(needle))) failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  const live = assertArrivalDetectionOnPollPath(good);
  if (live.length) failures.push(`live: ${live.join(" | ")}`);

  // 1. THE ORIGINAL STATE — the cron never mentions arrival detection.
  expect("never-wired", good.replace(/processArrivalDetectionsForGpsPoint/g, "someOtherThing"), "does not reference processArrivalDetectionsForGpsPoint");
  // 2. One ingest path loses its arrival call while keeping its geofence call.
  expect("one-path-dropped", good.replace(/\n\s*arrivalsTriggered \+= await detectArrivalsForIngestedPoint\([\s\S]*?\n      \);/, ""), "call site(s). Every cron path");
  // 3. The isolation is removed — a detection failure kills position ingest.
  expect("not-isolated", good.replace(/  try \{\n    const res = await processArrivalDetectionsForGpsPoint/, "  {\n    const res = await processArrivalDetectionsForGpsPoint"), "no longer isolates its failure");
  // 4. The error is swallowed.
  expect("error-swallowed", good.replace(/errors\.push\(\n      `arrival_detection_failed[\s\S]*?\);/, ""), "swallows its error");
  // 5. The count stops being reported.
  expect("count-hidden", good.replace(/arrivals_triggered/g, "zz_hidden"), "no longer reports arrivals_triggered");
  // 6. The helper is deleted.
  expect("helper-deleted", good.replace("async function detectArrivalsForIngestedPoint", "async function removedHelper"), "helper is gone");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 6/6 OK`);
  }
} else {
  const problems = assertArrivalDetectionOnPollPath(read());
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — arrival detection runs on every cron ingest path`);
}
