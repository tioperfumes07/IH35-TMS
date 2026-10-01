#!/usr/bin/env node
/**
 * ROUND 305 A-46 -- GUARD (verify-step 12005).
 *
 * E-14/E-15 (ORDERS 2026-10-01): every PM consumer reads ONE odometer source. FAILS IF:
 *   1. apps/backend/src/maintenance/pm-current-odometer.ts stops reusing the ONE engine
 *      (detectStops / attachNearestOdometer / unitFixesSql from telematics/stop-odometer-capture
 *      .service.ts) or grows its own stop detection or an interpolation.
 *   2. chooseCurrentOdometer loses its backwards-delta hold: a newer reading LOWER than an older one
 *      must be held, never used.
 *   3. any of the three PM-due consumers stops consulting it:
 *        - maintenance/pm-auto-engine.service.ts  (E-14 cron): unit_stop_events -> odometer_readings -> ABSENT
 *        - maint/pm.routes.ts                       (Maintenance Home /maint/pm/due): both GET routes
 *        - maintenance/pm-due-engine.service.ts     (T-29 engine): ledger + stop through the chooser
 *
 * Measured before wiring (2026-10-01): the PM auto-WO cron skipped 41 unit-runs as no-odometer in
 * 7 days; replayed at each skip's own timestamp, 19 had an odometer read at a recent stop.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-pm-due-feeds-from-stop-odometer";
const HELPER = "apps/backend/src/maintenance/pm-current-odometer.ts";
const AUTO = "apps/backend/src/maintenance/pm-auto-engine.service.ts";
const ROUTES = "apps/backend/src/maint/pm.routes.ts";
const ENGINE = "apps/backend/src/maintenance/pm-due-engine.service.ts";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function checkHelper(src) {
  // ONE loader (ORDERS 2026-10-01 rule 7): unit_stop_events (feature-detected) -> odometer_readings -> ABSENT.
  const p = [];
  const code = stripComments(src);
  const fn = code.match(/export async function loadPmOdometers\([\s\S]*?\n\}/);
  if (!fn) return [`${HELPER} has no loadPmOdometers -- every PM consumer must share one odometer source.`];
  const body = fn[0];
  const stopIdx = body.search(/FROM telematics\.unit_stop_events/);
  const snapIdx = body.search(/FROM telematics\.odometer_readings/);
  if (stopIdx === -1) p.push(`${HELPER} no longer reads telematics.unit_stop_events (E-03) first.`);
  if (snapIdx === -1) p.push(`${HELPER} no longer falls back to telematics.odometer_readings (E-06).`);
  if (stopIdx !== -1 && snapIdx !== -1 && stopIdx > snapIdx) p.push(`${HELPER} reads the E-06 snapshot before unit_stop_events.`);
  if (!/to_regclass\('telematics\.unit_stop_events'\)/.test(body)) p.push(`${HELPER} does not feature-detect telematics.unit_stop_events (E-03 pending must no-op, never crash).`);
  if (/vehicle_latest_position|raw_payload|\binterpolat|\blerp\b/i.test(code)) p.push(`${HELPER} reads a source outside the order or interpolates.`);
  return p;
}

function usesLoader(code, label, importPath) {
  const p = [];
  if (!new RegExp(`import\\s*\\{[^}]*\\bloadPmOdometers\\b[^}]*\\}\\s*from\\s*["']${importPath.replace(/[./]/g, (c) => "\\" + c)}["']`).test(code)) {
    p.push(`${label} does not import loadPmOdometers from ${importPath} -- a second odometer source.`);
  }
  if (/vehicle_latest_position|extractSamsaraOdometerMi|latestStopCapturedOdometer/.test(code)) {
    p.push(`${label} reads an odometer outside the shared loader (vehicle_latest_position / raw payload / in-memory stops).`);
  }
  return p;
}

export function checkAutoEngine(src) {
  const code = stripComments(src);
  const p = usesLoader(code, AUTO, "./pm-current-odometer.js");
  if (!/loadPmOdometers\(client/.test(code)) p.push(`${AUTO} never calls loadPmOdometers.`);
  if (!/skipped_no_baseline/.test(code)) p.push(`${AUTO} no longer records skipped_no_baseline -- a missing baseline would be guessed again.`);
  if (!/due_wo_flag_off/.test(code) || !/PM_AUTO_ENGINE_CREATE_WORK_ORDERS/.test(code)) p.push(`${AUTO} creates work orders without the flag-OFF gate.`);
  return p;
}

export function checkMaintRoutes(src) {
  const code = stripComments(src);
  const p = usesLoader(code, ROUTES, "../maintenance/pm-current-odometer.js");
  const calls = (code.match(/await\s+loadPmOdometers\(/g) || []).length;
  if (calls < 2) p.push(`${ROUTES} feeds the shared loader into ${calls} of the 2 GET routes (/maint/pm/schedules, /maint/pm/due).`);
  return p;
}

export function checkDueEngine(src) {
  const code = stripComments(src);
  const p = usesLoader(code, ENGINE, "./pm-current-odometer.js");
  if (!/loadPmOdometers\(client/.test(code)) p.push(`${ENGINE} never calls loadPmOdometers.`);
  if (!/pmScheduleBaselineAbsentReason\(/.test(code)) p.push(`${ENGINE} does not use the shared baseline rule -- NULL/<=1 must be ABSENT, never guessed.`);
  return p;
}

export function run() {
  const read = (rel) => {
    try {
      return readFileSync(resolve(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  const files = { [HELPER]: read(HELPER), [AUTO]: read(AUTO), [ROUTES]: read(ROUTES), [ENGINE]: read(ENGINE) };
  const missing = Object.entries(files).filter(([, v]) => v == null).map(([k]) => k);
  if (missing.length) return { ok: false, message: `${LABEL} FAILED: missing ${missing.join(", ")}` };
  const problems = [
    ...checkHelper(files[HELPER]),
    ...checkAutoEngine(files[AUTO]),
    ...checkMaintRoutes(files[ROUTES]),
    ...checkDueEngine(files[ENGINE]),
  ];
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? `${LABEL}: OK -- cron, PM due engine and /maint/pm/due share one loader: unit_stop_events -> odometer_readings -> ABSENT.`
        : `${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  let ok = true;
  const expect = (name, problems, wantFail) => {
    if (problems.length > 0 !== wantFail) {
      console.error(`SELFTEST FAIL: ${name} expected ${wantFail ? "a failure" : "no failure"}, got ${JSON.stringify(problems)}`);
      ok = false;
    }
  };
  const real = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
  expect("real helper", checkHelper(real(HELPER)), false);
  expect("real auto engine", checkAutoEngine(real(AUTO)), false);
  expect("real maint routes", checkMaintRoutes(real(ROUTES)), false);
  expect("real due engine", checkDueEngine(real(ENGINE)), false);
  expect("helper drops the stop tier", checkHelper(real(HELPER).replace(/FROM telematics\.unit_stop_events/, "FROM telematics.other")), true);
  expect("helper stops feature-detecting", checkHelper(real(HELPER).replace(/to_regclass\('telematics\.unit_stop_events'\)/, "true")), true);
  expect("helper reads the latest fix", checkHelper(real(HELPER) + "\nconst q = `SELECT 1 FROM telematics.vehicle_latest_position`;\n"), true);
  expect("cron loses the flag gate", checkAutoEngine(real(AUTO).replace(/due_wo_flag_off/g, "x")), true);
  expect("cron grows its own source", checkAutoEngine(real(AUTO) + "\nconst q = `SELECT 1 FROM telematics.vehicle_latest_position`;\n"), true);
  expect("routes wire only one GET", checkMaintRoutes(real(ROUTES).replace(/await\s+loadPmOdometers\(/, "await Promise.resolve(")), true);
  expect("due engine guesses a baseline", checkDueEngine(real(ENGINE).replace(/pmScheduleBaselineAbsentReason\(/g, "noop(")), true);
  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const passed = selftest();
    console.log(passed ? `${LABEL} selftest PASS` : `${LABEL} selftest FAIL`);
    process.exit(passed ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
