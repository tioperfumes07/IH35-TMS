#!/usr/bin/env node
/**
 * ROUND 303 T-40 — GUARD.
 *
 * FAILS IF:
 *   1. the poll-path position syncs (syncSamsaraVehicleLocations / syncSamsaraVehicleStats) stop
 *      calling arrival detection on every ingested point.
 *   2. arrival-detection.service.ts stops using the shared driverAtTimeSql helper for
 *      driver-at-the-time resolution, or re-inlines the assignment-window predicate.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const POSITIONS_FILE = resolve(ROOT, "apps/backend/src/integrations/samsara/samsara-positions.service.ts");
const ARRIVAL_FILE = resolve(ROOT, "apps/backend/src/telematics/arrival-detection.service.ts");

const INLINE_PREDICATE_RE = /\w*\.?started_at\s*<=\s*\S+\s+AND\s*\(\s*\w*\.?ended_at\s+IS\s+NULL\s+OR\s+\w*\.?ended_at\s*>/i;

export function checkPollPathCallsArrivalDetection(source) {
  const problems = [];
  const calls = (source.match(/detectArrivalsForIngestedPoint\(/g) ?? []).length;
  if (calls < 2) {
    problems.push(
      `samsara-positions.service.ts calls detectArrivalsForIngestedPoint ${calls} time(s) -- ` +
        `expected at least 2 (syncSamsaraVehicleLocations AND syncSamsaraVehicleStats). The poll ` +
        `path is the only caller that has ever actually run (webhooks have never delivered a ` +
        `single request) -- losing either call site silently re-kills arrival detection.`
    );
  }
  return problems;
}

export function checkUsesSharedDriverAttribution(source) {
  const problems = [];
  if (!/driverAtTimeSql/.test(source)) {
    problems.push("arrival-detection.service.ts no longer references driverAtTimeSql -- driver-at-time must resolve through the shared helper.");
  }
  if (INLINE_PREDICATE_RE.test(source)) {
    problems.push(
      "arrival-detection.service.ts contains its own copy of the assignment-window boundary " +
        "predicate -- this file was one of the 8 sites driver-attribution.ts's own header names " +
        "as needing migration; it must delegate, never re-inline."
    );
  }
  return problems;
}

export function run() {
  let positionsSource, arrivalSource;
  try {
    positionsSource = readFileSync(POSITIONS_FILE, "utf8");
  } catch {
    return { ok: false, message: `${POSITIONS_FILE.replace(ROOT + "/", "")} does not exist.` };
  }
  try {
    arrivalSource = readFileSync(ARRIVAL_FILE, "utf8");
  } catch {
    return { ok: false, message: `${ARRIVAL_FILE.replace(ROOT + "/", "")} does not exist.` };
  }
  const problems = [
    ...checkPollPathCallsArrivalDetection(positionsSource),
    ...checkUsesSharedDriverAttribution(arrivalSource),
  ];
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-arrival-detection-wired-on-poll-path: OK -- both poll-path syncs call arrival detection; driver-at-time uses the shared helper."
        : `verify-arrival-detection-wired-on-poll-path FAILED:\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  let ok = true;
  const expect = (name, problems, wantFail) => {
    const failed = problems.length > 0;
    if (failed !== wantFail) {
      console.error(`SELFTEST FAIL: ${name} expected ${wantFail ? "a failure" : "no failure"}, got ${JSON.stringify(problems)}`);
      ok = false;
    }
  };

  expect(
    "both poll-path call sites present",
    checkPollPathCallsArrivalDetection("detectArrivalsForIngestedPoint(a); detectArrivalsForIngestedPoint(b);"),
    false
  );
  expect("only one call site", checkPollPathCallsArrivalDetection("detectArrivalsForIngestedPoint(a);"), true);
  expect("no call site at all", checkPollPathCallsArrivalDetection("// nothing here"), true);

  expect(
    "uses shared helper, no inline predicate",
    checkUsesSharedDriverAttribution('import { driverAtTimeSql } from "../maintenance/driver-attribution.js"; driverAtTimeSql(a,b);'),
    false
  );
  expect("missing the helper reference", checkUsesSharedDriverAttribution("const x = 1;"), true);
  expect(
    "inline predicate sneaks back in",
    checkUsesSharedDriverAttribution("WHERE a.started_at <= $3 AND (a.ended_at IS NULL OR a.ended_at > $3)"),
    true
  );

  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const passed = selftest();
    console.log(passed ? "verify-arrival-detection-wired-on-poll-path selftest PASS" : "verify-arrival-detection-wired-on-poll-path selftest FAIL");
    process.exit(passed ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
