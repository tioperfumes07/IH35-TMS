#!/usr/bin/env node
/**
 * ROUND 303 T-42 — GUARD.
 *
 * "what PM or work order is due on arrival." Extends Round 301 T-34's geofence-state work with
 * the maintenance half of the feed.
 *
 * FAILS IF:
 *   1. the route's PM due no longer comes from maintenance.pm_schedules excluding sample/test units (same law as
 *      Round 303 T-37). ROUND 390.2 (CC-1): since #23673 (E-14 addition, 2026-09-30) the route reads PM due from E-15 —
 *      computePmDueEngineForCompany, the ONE PM due engine (shared odometer loader + ABSENT-baseline rule) — instead
 *      of a second inline projection whose columns were never SELECTed (pm_due_label was null on every card). The
 *      guard read only the route's own text and so reported that fix as a regression. It now follows the delegation:
 *      the route must call the engine AND the engine's own query must join maintenance.pm_schedules and exclude
 *      sample units. An inline join + exclusion in the route still passes; anything else fails.
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
const ENGINE_FILE = resolve(ROOT, "apps/backend/src/maintenance/pm-due-engine.service.ts");
const SAMPLE_EXCLUDED = /is_sample_data,?\s*false\)\s*=\s*false/i;

/** The body of the engine's exported computePmDueEngineForCompany (up to the next top-level export). */
export function engineBody(engineSource) {
  const i = engineSource.indexOf("export async function computePmDueEngineForCompany");
  if (i < 0) return "";
  const rest = engineSource.slice(i);
  const next = rest.slice(1).search(/\nexport\s/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

export function checkJoinsPmSchedulesExcludingSample(source, engineSource = "") {
  const problems = [];
  const inline = /maintenance\.pm_schedules/.test(source) && SAMPLE_EXCLUDED.test(source);
  if (inline) return problems;
  const delegates = /computePmDueEngineForCompany\s*\(/.test(source);
  const body = engineBody(engineSource);
  if (!delegates) {
    if (!/maintenance\.pm_schedules/.test(source)) {
      problems.push("arriving-soon.routes.ts no longer joins maintenance.pm_schedules (nor calls the E-15 PM engine) -- PM due status must come from the real schedule table.");
    }
    if (!SAMPLE_EXCLUDED.test(source)) {
      problems.push("arriving-soon.routes.ts's PM join does not exclude sample/test units (same law as Round 303 T-37).");
    }
    return problems;
  }
  if (!/maintenance\.pm_schedules/.test(body)) {
    problems.push("the route delegates PM due to computePmDueEngineForCompany, but the engine no longer reads maintenance.pm_schedules.");
  }
  if (!SAMPLE_EXCLUDED.test(body)) {
    problems.push("the route delegates PM due to computePmDueEngineForCompany, but the engine no longer excludes sample/test units (Round 303 T-37).");
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
  let engine = "";
  try {
    engine = readFileSync(ENGINE_FILE, "utf8");
  } catch {
    /* engine missing: a delegating route then fails on its own */
  }
  const problems = [
    ...checkJoinsPmSchedulesExcludingSample(source, engine),
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
  const ENGINE_OK = "export async function computePmDueEngineForCompany(c, o) { q(`FROM maintenance.pm_schedules s JOIN mdata.units u ON u.id = s.unit_id WHERE COALESCE(u.is_sample_data, false) = false`); }\nexport function other() {}";
  expect("390.2: route delegates to the E-15 engine, engine joins + excludes", checkJoinsPmSchedulesExcludingSample("await computePmDueEngineForCompany(client, id)", ENGINE_OK), false);
  expect("390.2: delegation, engine lost the sample exclusion", checkJoinsPmSchedulesExcludingSample("await computePmDueEngineForCompany(client, id)", ENGINE_OK.replace("COALESCE(u.is_sample_data, false) = false", "true")), true);
  expect("390.2: delegation, engine lost pm_schedules", checkJoinsPmSchedulesExcludingSample("await computePmDueEngineForCompany(client, id)", ENGINE_OK.replace("maintenance.pm_schedules", "maintenance.something_else")), true);
  expect("390.2: exclusion elsewhere in the engine file but not in computePmDueEngineForCompany fails", checkJoinsPmSchedulesExcludingSample("await computePmDueEngineForCompany(client, id)", "export async function computePmDueEngineForCompany() { q(`FROM maintenance.pm_schedules s`); }\nexport function x() { q(`COALESCE(u.is_sample_data, false) = false`); }"), true);

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
