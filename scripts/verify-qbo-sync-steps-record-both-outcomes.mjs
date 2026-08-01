#!/usr/bin/env node
/**
 * ACCT-F79 — every QBO sync step must record BOTH outcomes to _system.background_jobs.
 *
 * WHY (verified on prod br-fancy-credit-akjnd07a, 2026-08-01):
 * `runStep` in the QBO sync scheduler recorded ONLY its catch path. `recordBackgroundJobRun(step, true)`
 * appeared nowhere in the scheduler, so a step could be represented in exactly two states — FAILED or
 * ABSENT. A green step was structurally unrepresentable. Measured consequences:
 *   * 14 of 20 scheduled steps had NO ROW AT ALL — the entire AR/AP chain plus all three reconcilers.
 *     They were invisible BECAUSE they were succeeding.
 *   * All 6 steps that had a row showed last_successful_run_at = NULL. That column could never be
 *     non-null for any step, for any reason.
 *   * run_count_today was a FAILURE count wearing a run count's name.
 *   * "8 jobs have never succeeded" was itself an artifact of this defect, not a fleet of dead jobs.
 *
 * THE INVARIANT: a health surface that can only render red or nothing is not reporting health. Both
 * outcomes must be written, or the absence of a row is ambiguous between "never ran", "always worked",
 * and "not deployed" — three states an operator must be able to tell apart.
 *
 * VERIFY-THE-VERIFIER: this asserts the SUCCESS record is reachable on the non-throwing path, not that
 * the string "true" appears somewhere. It is mutation-tested in BOTH directions against the REAL
 * source, and every mutation asserts that it actually applied — a fixture that silently stops matching
 * the file would leave the negative case untested while still printing PASS.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCHED = "apps/backend/src/qbo-sync/sync-scheduler.ts";
const LABEL = "verify-qbo-sync-steps-record-both-outcomes";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Balanced-brace body of `async function runStep(...) { ... }`. */
function runStepBody(code) {
  const at = code.search(/async\s+function\s+runStep\s*\(/);
  if (at === -1) return null;
  const open = code.indexOf("{", code.indexOf(")", at));
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return null;
}

export function auditRunStep(src) {
  const code = stripComments(src);
  const problems = [];
  const body = runStepBody(code);
  if (body === null) {
    problems.push(`${SCHED}: no runStep function found — cannot verify job-run recording.`);
    return problems;
  }

  const failureRecord = /recordBackgroundJobRun\(\s*`qbo_sync\.step\.\$\{step\}`\s*,\s*false/.test(body);
  if (!failureRecord) {
    problems.push(
      `${SCHED}: runStep does not record a FAILED run for the step. A step that throws must land on ` +
        `the health surface, or a real outage is invisible.`
    );
  }

  // The success record must exist AND be reachable without throwing. Requiring it outside the catch
  // block is the point: a success record placed inside catch{} would only fire when the step failed.
  const successRecord = /recordBackgroundJobRun\(\s*`qbo_sync\.step\.\$\{step\}`\s*,\s*true/.test(body);
  if (!successRecord) {
    problems.push(
      `${SCHED}: runStep NEVER records a SUCCESSFUL run — recordBackgroundJobRun(step, true) is absent. ` +
        `_system.background_jobs can then only represent a step as FAILED or ABSENT, last_successful_run_at ` +
        `stays NULL forever, and a working step is indistinguishable from one that never ran. This is the ` +
        `ACCT-F79 defect: 14 of 20 steps had no row at all precisely because they were succeeding.`
    );
    return problems;
  }

  // Reachability: the success call must not be inside the catch block.
  const catchAt = body.search(/catch\s*\(/);
  if (catchAt !== -1) {
    const catchOpen = body.indexOf("{", catchAt);
    let depth = 0;
    let catchEnd = -1;
    for (let i = catchOpen; i < body.length; i += 1) {
      if (body[i] === "{") depth += 1;
      else if (body[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          catchEnd = i;
          break;
        }
      }
    }
    if (catchEnd !== -1) {
      const catchBody = body.slice(catchOpen, catchEnd);
      const outside = body.slice(0, catchOpen) + body.slice(catchEnd);
      const successInCatchOnly =
        /recordBackgroundJobRun\(\s*`qbo_sync\.step\.\$\{step\}`\s*,\s*true/.test(catchBody) &&
        !/recordBackgroundJobRun\(\s*`qbo_sync\.step\.\$\{step\}`\s*,\s*true/.test(outside);
      if (successInCatchOnly) {
        problems.push(
          `${SCHED}: runStep records success ONLY inside the catch block — it can fire only when the ` +
            `step failed. The success record must be reachable on the non-throwing path.`
        );
      }
    }
  }

  return problems;
}

function realSource() {
  return readFileSync(join(ROOT, SCHED), "utf8");
}

function mutate(src, from, to, label) {
  const out = src.replace(from, to);
  if (out === src) {
    throw new Error(
      `mutation "${label}" did not apply — the selftest fixture no longer matches ${SCHED}. ` +
        `The negative case is UNTESTED; fix the fixture rather than trusting this guard.`
    );
  }
  return out;
}

function selftest() {
  const failures = [];
  const real = realSource();

  const clean = auditRunStep(real);
  if (clean.length !== 0) failures.push(`case0 FAIL — real source flagged: ${clean.join(" | ")}`);

  const cases = [
    {
      label: "success recording removed (the exact ACCT-F79 defect)",
      mutated: () =>
        mutate(
          real,
          /\n\s*if \(succeeded\) await recordBackgroundJobRun\(`qbo_sync\.step\.\$\{step\}`, true, null\);/,
          "",
          "remove success record"
        ),
      expect: "NEVER records a SUCCESSFUL run",
    },
    {
      label: "failure recording removed",
      mutated: () =>
        mutate(
          real,
          /\n\s*await recordBackgroundJobRun\(`qbo_sync\.step\.\$\{step\}`, false, `\$\{operatingCompanyId\}: \$\{msg\}`\);/,
          "",
          "remove failure record"
        ),
      expect: "does not record a FAILED run",
    },
  ];

  for (const c of cases) {
    let problems;
    try {
      problems = auditRunStep(c.mutated());
    } catch (err) {
      failures.push(`FAIL — ${c.label}: ${err.message}`);
      continue;
    }
    if (!problems.some((p) => p.includes(c.expect))) {
      failures.push(
        `FAIL — ${c.label} was NOT caught (expected a problem containing "${c.expect}"; got: ${problems.join(" | ") || "no problems"})`
      );
    }
  }

  // Reachability case: success recorded ONLY inside catch must be rejected. Built from real source so
  // the fixture cannot drift away from the shape it is meant to represent.
  try {
    const successMovedIntoCatch = mutate(
      mutate(
        real,
        /\n\s*if \(succeeded\) await recordBackgroundJobRun\(`qbo_sync\.step\.\$\{step\}`, true, null\);/,
        "",
        "remove success record (reachability setup)"
      ),
      "await recordBackgroundJobRun(`qbo_sync.step.${step}`, false, `${operatingCompanyId}: ${msg}`);",
      "await recordBackgroundJobRun(`qbo_sync.step.${step}`, false, `${operatingCompanyId}: ${msg}`);\n    await recordBackgroundJobRun(`qbo_sync.step.${step}`, true, null);",
      "move success record inside catch"
    );
    const problems = auditRunStep(successMovedIntoCatch);
    if (!problems.some((p) => p.includes("ONLY inside the catch block"))) {
      failures.push(
        `FAIL — success recorded only inside catch was NOT caught (got: ${problems.join(" | ") || "no problems"})`
      );
    }
  } catch (err) {
    failures.push(`FAIL — reachability case: ${err.message}`);
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — real source clean; success-removed, failure-removed, and ` +
      `success-only-inside-catch all rejected. Every mutation verified to have applied.`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditRunStep(realSource());
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — runStep records BOTH a successful and a failed run; success is reachable off the catch path.`);
}

main();
