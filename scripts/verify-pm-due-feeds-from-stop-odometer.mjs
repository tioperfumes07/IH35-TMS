#!/usr/bin/env node
/**
 * ROUND 305 A-46 -- GUARD (verify-step 12005).
 *
 * PM due is fed from the Lead's stop-odometer engine. FAILS IF:
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
  const p = [];
  const code = stripComments(src);
  const imp = code.match(/import\s*\{([\s\S]*?)\}\s*from\s*["']\.\.\/telematics\/stop-odometer-capture\.service\.js["']/);
  if (!imp) {
    p.push(`${HELPER} no longer imports from ../telematics/stop-odometer-capture.service.js -- PM due must reuse the Lead's ONE engine.`);
  } else {
    for (const fn of ["detectStops", "attachNearestOdometer", "unitFixesSql"]) {
      if (!new RegExp(`\\b${fn}\\b`).test(imp[1])) p.push(`${HELPER} does not import ${fn} from the stop-odometer engine.`);
    }
  }
  if (/function\s+(detectStops|attachNearestOdometer|isStopped)\b/.test(code)) {
    p.push(`${HELPER} defines its own stop detection -- a second engine. Reuse telematics/stop-odometer-capture.service.ts.`);
  }
  if (/\binterpolat|\blerp\b/i.test(code)) {
    p.push(`${HELPER} contains interpolation code -- an odometer is READ or ABSENT, never interpolated.`);
  }
  const chooser = code.match(/export function chooseCurrentOdometer\([\s\S]*?\n\}/);
  if (!chooser) {
    p.push(`${HELPER} has no chooseCurrentOdometer.`);
  } else if (!/odometer_miles\s*>\s*\w+\.odometer_miles/.test(chooser[0]) || !/held/.test(chooser[0])) {
    p.push(`${HELPER} chooseCurrentOdometer lost its backwards-delta hold -- a newer reading below an older one must be held.`);
  }
  return p;
}

export function checkAutoEngine(src) {
  // E-14 (ORDERS 2026-10-01): source order is unit_stop_events -> odometer_readings -> ABSENT, nothing else.
  const p = [];
  const code = stripComments(src);
  const fn = code.match(/async function loadUnitOdometers\([\s\S]*?\n\}/);
  if (!fn) {
    p.push(`${AUTO} has no loadUnitOdometers to check.`);
    return p;
  }
  const body = fn[0];
  const stopIdx = body.search(/FROM telematics\.unit_stop_events/);
  const snapIdx = body.search(/FROM telematics\.odometer_readings/);
  if (stopIdx === -1) p.push(`${AUTO} loadUnitOdometers no longer reads telematics.unit_stop_events (E-03) first.`);
  if (snapIdx === -1) p.push(`${AUTO} loadUnitOdometers no longer falls back to telematics.odometer_readings (E-06).`);
  if (stopIdx !== -1 && snapIdx !== -1 && stopIdx > snapIdx) p.push(`${AUTO} reads the E-06 snapshot before unit_stop_events -- E-14 order is stops first.`);
  if (/vehicle_latest_position|raw_payload|interpolat/i.test(body)) {
    p.push(`${AUTO} loadUnitOdometers reads a source outside the E-14 order (vehicle_latest_position / raw_payload) or interpolates.`);
  }
  if (!/relationExists\(client,\s*"telematics\.unit_stop_events"\)/.test(body)) {
    p.push(`${AUTO} does not feature-detect telematics.unit_stop_events -- the cron must no-op that tier until E-03 is live, never crash.`);
  }
  if (!/skipped_no_baseline/.test(code)) p.push(`${AUTO} no longer records skipped_no_baseline -- a missing baseline would be guessed again.`);
  if (!/due_wo_flag_off/.test(code) || !/PM_AUTO_ENGINE_CREATE_WORK_ORDERS/.test(code)) {
    p.push(`${AUTO} creates work orders without the flag-OFF gate (ORDERS rule 2: business records ship flag-OFF).`);
  }
  return p;
}

export function checkMaintRoutes(src) {
  const p = [];
  const code = stripComments(src);
  if (!/import\s*\{[^}]*\blatestStopCapturedOdometer\b[^}]*\}\s*from\s*["']\.\.\/maintenance\/pm-current-odometer\.js["']/.test(code)) {
    p.push(`${ROUTES} does not import latestStopCapturedOdometer -- Maintenance Home shows no odometer whenever the latest fix has none.`);
  }
  // Call sites only -- the function's own definition must not count as a wiring.
  const calls = (code.match(/await\s+stopOdometersForUnitsWithoutLive\(/g) || []).length;
  if (calls < 2) {
    p.push(`${ROUTES} feeds stop-captured odometers into ${calls} of the 2 GET routes (/maint/pm/schedules and /maint/pm/due).`);
  }
  const map = code.match(/function mapDueRow\([\s\S]*?\n\}/);
  if (!map) p.push(`${ROUTES} has no mapDueRow to check.`);
  else {
    const body = map[0];
    const stopIdx = body.search(/stop\.odometer_miles/);
    const rawIdx = body.search(/:\s*rawPayloadOdometer/);
    if (stopIdx === -1) p.push(`${ROUTES} mapDueRow never uses the stop-captured odometer.`);
    else if (rawIdx !== -1 && stopIdx > rawIdx) p.push(`${ROUTES} mapDueRow ranks raw_payload above the stop-captured odometer.`);
  }
  return p;
}

export function checkDueEngine(src) {
  const p = [];
  const code = stripComments(src);
  for (const fn of ["chooseCurrentOdometer", "latestStopCapturedOdometer"]) {
    if (!new RegExp(`import\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}\\s*from\\s*["']\\./pm-current-odometer\\.js["']`).test(code)) {
      p.push(`${ENGINE} does not import ${fn} from ./pm-current-odometer.js.`);
    }
  }
  const cur = code.match(/async function currentOdometer\([\s\S]*?\n\}/);
  if (!cur) p.push(`${ENGINE} has no currentOdometer to check.`);
  else if (!/latestStopCapturedOdometer\(/.test(cur[0]) || !/chooseCurrentOdometer\(/.test(cur[0])) {
    p.push(`${ENGINE} currentOdometer no longer runs the ledger and the stop-captured odometer through chooseCurrentOdometer.`);
  }
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
        ? `${LABEL}: OK -- all three PM-due consumers consult the stop-captured odometer via the Lead's one engine; backwards readings are held.`
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

  expect("helper copies the engine", checkHelper(real(HELPER) + "\nfunction detectStops() {}\n"), true);
  expect("helper interpolates", checkHelper(real(HELPER) + "\nconst x = interpolate(a, b);\n"), true);
  expect("helper drops the import", checkHelper(real(HELPER).replace(/stop-odometer-capture\.service\.js/, "elsewhere.js")), true);
  expect(
    "chooser loses the hold",
    checkHelper(real(HELPER).replace(/o\.odometer_miles > c\.odometer_miles/, "false")),
    true
  );
  expect(
    "cron drops the unit_stop_events tier",
    checkAutoEngine(real(AUTO).replace(/FROM telematics\.unit_stop_events/, "FROM telematics.other")),
    true
  );
  expect(
    "cron loses the work-order flag gate",
    checkAutoEngine(real(AUTO).replace(/due_wo_flag_off/g, "x")),
    true
  );
  expect(
    "routes wire only one GET",
    checkMaintRoutes(real(ROUTES).replace(/stopOdometersForUnitsWithoutLive\(client, schedules\)/, "new Map()")),
    true
  );
  expect(
    "due engine bypasses the chooser",
    checkDueEngine(real(ENGINE).replace(/chooseCurrentOdometer\(\[ledger, stop\]\)/, "({})")),
    true
  );
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
