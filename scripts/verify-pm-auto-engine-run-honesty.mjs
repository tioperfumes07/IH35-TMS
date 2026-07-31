#!/usr/bin/env node
/**
 * MAINT-PM-ENGINE-01 — the PM auto-engine must never report a no-effect run as a clean success.
 *
 * Bites the exact defect found on prod 2026-07-31: 3,554 `maintenance.pm_schedule_runs` rows all
 * carrying status='completed' with error_message NULL and 0 created, while 41,070 of 41,070
 * evaluations logged action='skipped_no_odometer'. Green cron, growing log, zero output, nothing
 * operator-visible — for two months, on a fleet whose PM programme is a DOT obligation.
 *
 * A guard that only asserted "the engine runs" would have stayed green through all 3,554 of them.
 * This one asserts the reporting, which is where the failure actually lived.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pm-auto-engine-run-honesty";
const SELFTEST = process.argv.includes("--selftest");
const ENGINE = path.join(ROOT, "apps/backend/src/maintenance/pm-auto-engine.service.ts");

/** @param {string} src pm-auto-engine.service.ts contents */
export function check(src) {
  const problems = [];
  if (!src) return ["missing apps/backend/src/maintenance/pm-auto-engine.service.ts"];

  // 1. The skip must be COUNTED. Without a counter the finalize step cannot distinguish
  //    "nothing to do" from "did nothing", which is the whole defect.
  if (!/skippedNoOdometer/.test(src)) {
    problems.push("no skippedNoOdometer counter — the engine cannot tell 'nothing to do' from 'did nothing'");
  } else if (!/skippedNoOdometer\s*\+=\s*1|skippedNoOdometer\+\+/.test(src)) {
    problems.push("skippedNoOdometer is declared but never incremented");
  }

  // 2. The terminal status must NOT be hardcoded 'completed' in the success-path UPDATE.
  const finalizeHardcoded = /UPDATE maintenance\.pm_schedule_runs[\s\S]{0,200}?SET[\s\S]{0,120}?status\s*=\s*'completed'/;
  if (finalizeHardcoded.test(src)) {
    problems.push("finalize UPDATE hardcodes status='completed' — a no-effect run would report success");
  }

  // 3. There must be a branch that downgrades a no-effect run.
  if (!/no_odometer_for_all_units/.test(src)) {
    problems.push("no 'no_odometer_for_all_units' diagnostic — an all-skipped run is still reported as a success");
  }
  if (!/no_active_pm_schedules/.test(src)) {
    problems.push("no 'no_active_pm_schedules' diagnostic — a run with zero active schedules is silently 'completed'");
  }

  // 4. The finalize UPDATE must write error_message, or the diagnostic never reaches an operator.
  const finalize = src.match(/UPDATE maintenance\.pm_schedule_runs[\s\S]{0,400}?WHERE id = \$1::uuid/g) ?? [];
  const successPath = finalize.find((q) => /schedules_evaluated/.test(q));
  if (!successPath) problems.push("could not locate the finalize UPDATE (schedules_evaluated) — guard cannot verify it");
  else if (!/error_message/.test(successPath)) {
    problems.push("finalize UPDATE does not set error_message — the no-effect diagnostic never reaches an operator");
  }

  // 5. Only statuses permitted by pm_schedule_runs_status_check may be written.
  const ALLOWED = new Set(["running", "completed", "failed", "skipped"]);
  for (const m of src.matchAll(/runStatus\s*=\s*"([a-z_]+)"/g)) {
    if (!ALLOWED.has(m[1])) {
      problems.push(`runStatus="${m[1]}" violates pm_schedule_runs_status_check (running|completed|failed|skipped) — would throw at runtime`);
    }
  }

  return problems;
}

function selftest() {
  const good = `
    let skippedNoOdometer = 0;
    skippedNoOdometer += 1;
    let runStatus = "completed";
    if (schedules.length === 0) { runStatus = "skipped"; runDiagnostic = "no_active_pm_schedules: ..."; }
    else if (noEffect && skippedNoOdometer === schedules.length) { runStatus = "skipped"; runDiagnostic = "no_odometer_for_all_units: ..."; }
    UPDATE maintenance.pm_schedule_runs
      SET status = $5, finished_at = now(), schedules_evaluated = $2, work_orders_created = $3,
          alerts_created = $4, error_message = $6
      WHERE id = $1::uuid
  `;
  // The EXACT pre-fix shape that shipped this defect to prod.
  const preFix = `
    UPDATE maintenance.pm_schedule_runs
      SET status = 'completed', finished_at = now(), schedules_evaluated = $2,
          work_orders_created = $3, alerts_created = $4
      WHERE id = $1::uuid
  `;
  // Counter present and downgrade present, but the diagnostic is never persisted.
  const noErrorColumn = good.replace(/,\s*error_message = \$6/, "");
  // A status the CHECK constraint would reject at runtime.
  const badStatus = good.replace(/runStatus = "skipped"/, 'runStatus = "completed_no_effect"');

  if (check(good).length) throw new Error(`${LABEL} selftest: compliant flagged — ${check(good).join("; ")}`);
  if (!check("").length) throw new Error(`${LABEL} selftest: missing file not caught`);

  const pre = check(preFix);
  if (!pre.some((p) => /hardcodes status='completed'/.test(p)) || !pre.some((p) => /skippedNoOdometer/.test(p))) {
    throw new Error(`${LABEL} selftest: the ACTUAL prod defect (hardcoded completed, no counter) not caught — got ${JSON.stringify(pre)}`);
  }
  if (!check(noErrorColumn).some((p) => /error_message/.test(p))) {
    throw new Error(`${LABEL} selftest: unpersisted diagnostic not caught`);
  }
  if (!check(badStatus).some((p) => /pm_schedule_runs_status_check/.test(p))) {
    throw new Error(`${LABEL} selftest: status outside the CHECK constraint not caught`);
  }
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const problems = check(fs.existsSync(ENGINE) ? fs.readFileSync(ENGINE, "utf8") : "");
if (problems.length) {
  console.error(`[${LABEL}] FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS`);
