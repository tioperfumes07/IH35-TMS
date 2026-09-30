#!/usr/bin/env node
/**
 * ROUND 301 T-29 — GUARD.
 *
 * FAILS IF:
 *   1. a projected due date is derived from a fleet-wide mileage average (the owner's own
 *      12,000-mi/month rule of thumb, or any other hardcoded fleet-wide rate) instead of the
 *      unit's own trailing 90-day rate.
 *   2. projectPmDueDateFromRate could return a non-null projected_due_date when milesPerDay is
 *      null (an odometer-gap/insufficient-history refusal) — checked statically against
 *      pm-due.shared.ts's own source, since a plain .mjs script cannot import a .ts file directly.
 *   3. pm-due-engine.service.ts makes, or imports anything that makes, a second daily Samsara
 *      mileage call — it must read ONLY telematics.odometer_readings.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const ENGINE_FILE = resolve(ROOT, "apps/backend/src/maintenance/pm-due-engine.service.ts");
const SHARED_FILE = resolve(ROOT, "apps/backend/src/maint/pm-due.shared.ts");

// A fleet-wide "miles per day" implied by the owner's own 12,000 mi/month rule of thumb, and a
// few equivalent spellings -- if any of these literals appear in the engine or shared file, a
// fleet average snuck in instead of the per-unit computed rate.
const FLEET_AVERAGE_LITERALS = [/12[,_]?000\b/, /12000\s*\/\s*30/, /400\s*\/\*.*mi.*day/i];

/** Strip comments so a doc comment EXPLAINING why we reject the owner's 12,000-mi/month rule of
 *  thumb doesn't itself trip the literal-detector meant for live code. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function checkNoFleetAverageLiteral(source, label) {
  const problems = [];
  const code = stripComments(source);
  for (const re of FLEET_AVERAGE_LITERALS) {
    if (re.test(code)) {
      problems.push(
        `${label} contains a literal matching ${re} -- looks like the owner's 12,000-mi/month ` +
          `fleet average snuck into the per-unit rate computation. Every projected due date must ` +
          `come from computeUnitMileageRate()'s own live per-unit query, never a fleet-wide constant.`
      );
    }
  }
  return problems;
}

export function checkNoSamsaraImport(source) {
  const problems = [];
  if (/samsara-client|SamsaraClient|listVehicleStats|listVehicleLocations|listVehicleFaultCodes/.test(source)) {
    problems.push(
      "pm-due-engine.service.ts references the Samsara client/API -- it must read ONLY " +
        "telematics.odometer_readings (the ledger the existing 03:00 CT J-1 cron already " +
        "writes), never a second daily Samsara call."
    );
  }
  return problems;
}

/**
 * Static check on projectPmDueDateFromRate's own source: the milesPerDay==null branch must
 * return BEFORE any date arithmetic runs, and must carry a non-null reason. A real cross-file
 * import isn't available to a plain .mjs guard (pm-due.shared.ts is TypeScript), so this checks
 * the function body's own text shape instead of importing and calling it.
 */
export function checkGapRefusalPrecedesDateMath(sharedSource) {
  const problems = [];
  const fnMatch = sharedSource.match(/export function projectPmDueDateFromRate\([\s\S]*?\n\}/);
  if (!fnMatch) {
    problems.push("could not find projectPmDueDateFromRate in pm-due.shared.ts to check.");
    return problems;
  }
  const body = fnMatch[0];
  const milesPerDayCheckIdx = body.search(/if\s*\(\s*milesPerDay\s*==\s*null\s*\)/);
  const dateMathIdx = body.search(/setUTCDate/);
  if (milesPerDayCheckIdx === -1) {
    problems.push("projectPmDueDateFromRate no longer checks milesPerDay == null -- the gap-refusal branch is missing.");
  } else if (dateMathIdx !== -1 && milesPerDayCheckIdx > dateMathIdx) {
    problems.push("projectPmDueDateFromRate's milesPerDay==null check runs AFTER date arithmetic -- a gap could produce a non-null date before being refused.");
  }
  // The null-rate branch must return a non-null reason, never a bare null result.
  const nullRateBranch = body.slice(milesPerDayCheckIdx, milesPerDayCheckIdx + 200);
  if (milesPerDayCheckIdx !== -1 && !/reason:\s*rateUnavailableReason/.test(nullRateBranch)) {
    problems.push("projectPmDueDateFromRate's milesPerDay==null branch does not visibly carry the caller's stated reason forward.");
  }
  return problems;
}

export function checkNoBaselinePrecedesEverything(sharedSource) {
  const problems = [];
  const fnMatch = sharedSource.match(/export function projectPmDueDateFromRate\([\s\S]*?\n\}/);
  if (!fnMatch) return problems;
  const body = fnMatch[0];
  const baselineCheckIdx = body.search(/if\s*\(\s*milesRemaining\s*==\s*null\s*\)/);
  const firstIfIdx = body.search(/if\s*\(/);
  if (baselineCheckIdx === -1) {
    problems.push("projectPmDueDateFromRate no longer checks milesRemaining == null -- the no-baseline-guess guard is missing.");
  } else if (baselineCheckIdx !== firstIfIdx) {
    problems.push("projectPmDueDateFromRate's milesRemaining==null (no baseline) check is not the FIRST conditional in the function -- it must be checked before anything else can produce a guessed date.");
  }
  return problems;
}

export function run() {
  let engineSource, sharedSource;
  try {
    engineSource = readFileSync(ENGINE_FILE, "utf8");
  } catch {
    return { ok: false, message: `${ENGINE_FILE.replace(ROOT + "/", "")} does not exist.` };
  }
  try {
    sharedSource = readFileSync(SHARED_FILE, "utf8");
  } catch {
    return { ok: false, message: `${SHARED_FILE.replace(ROOT + "/", "")} does not exist.` };
  }

  const problems = [
    ...checkNoFleetAverageLiteral(engineSource, "pm-due-engine.service.ts"),
    ...checkNoFleetAverageLiteral(sharedSource, "pm-due.shared.ts"),
    ...checkNoSamsaraImport(engineSource),
    ...checkGapRefusalPrecedesDateMath(sharedSource),
    ...checkNoBaselinePrecedesEverything(sharedSource),
  ];
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-pm-due-engine-no-fleet-average-no-samsara-call: OK -- no fleet average, no Samsara call, gap/no-baseline both refuse before any date math."
        : `verify-pm-due-engine-no-fleet-average-no-samsara-call FAILED:\n  - ${problems.join("\n  - ")}`,
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

  expect("clean source, no fleet average", checkNoFleetAverageLiteral("const x = rate.miles_per_day;", "test"), false);
  expect("12000 literal sneaks in", checkNoFleetAverageLiteral("const fleetAvg = 12000 / 30;", "test"), true);
  expect("12_000 literal sneaks in", checkNoFleetAverageLiteral("const fleetAvg = 12_000;", "test"), true);

  expect("clean source, no Samsara import", checkNoSamsaraImport("import { x } from './y.js';"), false);
  expect("Samsara client import sneaks in", checkNoSamsaraImport('import { SamsaraClient } from "../integrations/samsara/samsara-client.js";'), true);

  const goodFn = `
export function projectPmDueDateFromRate(a, b, c, d) {
  if (milesRemaining == null) { return { projected_due_date: null, reason: "no baseline" }; }
  if (milesRemaining <= 0) { return { projected_due_date: today, reason: null }; }
  if (milesPerDay == null) { return { projected_due_date: null, reason: rateUnavailableReason ?? "x" }; }
  const due = new Date(today);
  due.setUTCDate(due.getUTCDate() + 5);
  return { projected_due_date: due.toISOString(), reason: null };
}`;
  expect("real shape passes gap-precedes-date-math", checkGapRefusalPrecedesDateMath(goodFn), false);
  expect("real shape passes no-baseline-first", checkNoBaselinePrecedesEverything(goodFn), false);

  const badFn = `
export function projectPmDueDateFromRate(a, b, c, d) {
  if (milesRemaining == null) { return { projected_due_date: null, reason: "no baseline" }; }
  const due = new Date(today);
  due.setUTCDate(due.getUTCDate() + 5);
  if (milesPerDay == null) { return { projected_due_date: null, reason: rateUnavailableReason ?? "x" }; }
  return { projected_due_date: due.toISOString(), reason: null };
}`;
  expect("broken shape catches gap-check-after-date-math", checkGapRefusalPrecedesDateMath(badFn), true);

  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const passed = selftest();
    console.log(passed ? "verify-pm-due-engine-no-fleet-average-no-samsara-call selftest PASS" : "verify-pm-due-engine-no-fleet-average-no-samsara-call selftest FAIL");
    process.exit(passed ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
