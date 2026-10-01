#!/usr/bin/env node
/**
 * ROUND 303 T-42 — GUARD.
 *
 * "what PM or work order is due on arrival." Extends Round 301 T-34's geofence-state work with
 * the maintenance half of the feed.
 *
 * FAILS IF:
 *   1. the route no longer joins maintenance.pm_schedules for the soonest active miles-based
 *      schedule, excluding sample/test units (same law as Round 303 T-37).
 *   2. the route no longer joins maintenance.work_orders for an existing open WO against the
 *      unit.
 *   3. the response mapping no longer exposes pm_due_label / pm_next_due_odometer /
 *      open_work_order_id.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const ROUTE_FILE = resolve(ROOT, "apps/backend/src/maintenance/arriving-soon.routes.ts");

export function checkJoinsPmSchedulesExcludingSample(source) {
  const problems = [];
  if (!/maintenance\.pm_schedules/.test(source)) {
    problems.push("arriving-soon.routes.ts no longer joins maintenance.pm_schedules -- PM due status must come from the real schedule table.");
  }
  if (!/is_sample_data,?\s*false\)\s*=\s*false/i.test(source)) {
    problems.push("arriving-soon.routes.ts's PM join does not exclude sample/test units (same law as Round 303 T-37).");
  }
  return problems;
}

export function checkJoinsOpenWorkOrders(source) {
  const problems = [];
  if (!/maintenance\.work_orders/.test(source)) {
    problems.push("arriving-soon.routes.ts no longer joins maintenance.work_orders -- an already-open repair must surface on arrival.");
  }
  return problems;
}

export function checkExposesPmAndWoFields(source) {
  const problems = [];
  for (const field of ["pm_due_label", "pm_next_due_odometer", "open_work_order_id"]) {
    if (!new RegExp(`${field}\\s*:`).test(source)) {
      problems.push(`arriving-soon.routes.ts's card mapping does not expose ${field}.`);
    }
  }
  return problems;
}

export function run() {
  let source;
  try {
    source = readFileSync(ROUTE_FILE, "utf8");
  } catch {
    return { ok: false, message: `${ROUTE_FILE.replace(ROOT + "/", "")} does not exist.` };
  }
  const problems = [
    ...checkJoinsPmSchedulesExcludingSample(source),
    ...checkJoinsOpenWorkOrders(source),
    ...checkExposesPmAndWoFields(source),
  ];
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-arriving-soon-serves-pm-and-wo-due: OK -- PM schedule and open-WO joins present, sample units excluded, fields exposed."
        : `verify-arriving-soon-serves-pm-and-wo-due FAILED:\n  - ${problems.join("\n  - ")}`,
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
    "pm join present, sample excluded",
    checkJoinsPmSchedulesExcludingSample("FROM maintenance.pm_schedules ps JOIN mdata.units pu ON COALESCE(pu.is_sample_data, false) = false"),
    false
  );
  expect("pm join missing", checkJoinsPmSchedulesExcludingSample("SELECT 1"), true);
  expect("pm join present but no sample exclusion", checkJoinsPmSchedulesExcludingSample("FROM maintenance.pm_schedules ps"), true);

  expect("wo join present", checkJoinsOpenWorkOrders("FROM maintenance.work_orders wo"), false);
  expect("wo join missing", checkJoinsOpenWorkOrders("SELECT 1"), true);

  expect(
    "all fields exposed",
    checkExposesPmAndWoFields("pm_due_label: x, pm_next_due_odometer: y, open_work_order_id: z,"),
    false
  );
  expect("a field missing", checkExposesPmAndWoFields("pm_due_label: x,"), true);

  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const passed = selftest();
    console.log(passed ? "verify-arriving-soon-serves-pm-and-wo-due selftest PASS" : "verify-arriving-soon-serves-pm-and-wo-due selftest FAIL");
    process.exit(passed ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
