#!/usr/bin/env node
/**
 * OPS-F65 — the health check must report a NEVER-SUCCEEDED background job distinctly from a merely
 * LATE one, and must still keep job names out of the public payload.
 *
 * WHY THIS EXISTS (prod br-fancy-credit-akjnd07a, 2026-08-01): _system.background_jobs held EIGHT
 * jobs with last_successful_run_at = NULL — the DOT random drug/alcohol pool draw, four QBO sync
 * steps, the universal search indexer, and two USMCA pulls that could never authorize — alongside
 * five merely-stale ones. The check collapsed all thirteen into a single warning-tier "stale_jobs"
 * token, so a code path that had NEVER worked looked exactly like one that ran twelve minutes ago.
 * That is how every one of those defects stayed invisible while the jobs "ran" on schedule and
 * incremented their run counters.
 *
 * A signal that is permanently slightly-red trains people to stop reading it. Separating the two
 * conditions costs nothing in exposure — the names were never public and still are not.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SVC = "apps/backend/src/health/health.routes.ts";
const LABEL = "verify-never-succeeded-jobs-distinct";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function auditHealth(src) {
  const code = stripComments(src);
  const problems = [];
  if (!/never_succeeded_jobs/.test(code)) {
    problems.push(
      `${SVC}: no never_succeeded_jobs health code. A job that has NEVER succeeded is reported as ` +
        `plain "stale_jobs", making a permanently broken code path indistinguishable from one that is ` +
        `a few minutes late — the exact collapse that hid 8 broken jobs on prod.`
    );
    return problems;
  }
  // The never-succeeded branch must key on a null last-success, not on a staleness threshold.
  if (!/mins\s*===\s*null/.test(code)) {
    problems.push(`${SVC}: the never-succeeded branch does not test a null last-success (mins === null).`);
  }
  // OPS-F69: never-succeeded must be reachable WITHOUT a staleness rule. On prod all 8 never-succeeded
  // jobs were unruled, so a `if (!rule) continue` placed ABOVE the null test skipped every one of them
  // and made the distinct code useless in practice.
  const loop = /for\s*\(const row of res\.rows\)\s*\{([\s\S]*?)\n    \}/.exec(code);
  if (loop) {
    const body = loop[1];
    const iNull = body.search(/mins\s*===\s*null/);
    const iRuleGate = body.search(/if\s*\(!rule[\s\S]{0,40}\)\s*continue/);
    if (iRuleGate !== -1 && iNull !== -1 && iRuleGate < iNull) {
      problems.push(
        `${SVC}: the rule gate (\`if (!rule) continue\`) runs BEFORE the never-succeeded test, so a job ` +
          `with no staleness rule can never be reported as never-succeeded. On prod all 8 never-succeeded ` +
          `jobs were unruled — this ordering is what made the distinct code fire for none of them.`
      );
    }
  }
  // Job names must never reach the public payload — they belong in the logged detail only.
  if (/HealthCheckError\(\s*`/.test(code) || /HealthCheckError\(\s*[a-zA-Z_$][\w$]*\s*[,)]/.test(code)) {
    problems.push(
      `${SVC}: a HealthCheckError public code is interpolated or variable. Public codes must be fixed ` +
        `literals — /healthz is unauthenticated and job names describe internal structure.`
    );
  }
  return problems;
}

function auditTree() {
  return auditHealth(readFileSync(join(ROOT, SVC), "utf8"));
}

function selftest() {
  const failures = [];
  const collapsed = `
    const stale = [];
    if (mins === null || mins > rule.maxStaleMinutes) stale.push(row.job_name);
    if (stale.length > 0) throw new HealthCheckError("stale_jobs", stale.join("|"));
  `;
  if (!auditHealth(collapsed).some((p) => p.includes("no never_succeeded_jobs health code")))
    failures.push("case1 FAIL — the collapsed single-code shape was NOT caught");

  const split = `
    if (mins === null) neverSucceeded.push(row.job_name); else if (mins > rule.maxStaleMinutes) late.push(row.job_name);
    if (neverSucceeded.length > 0) throw new HealthCheckError("never_succeeded_jobs", detail);
    if (late.length > 0) throw new HealthCheckError("stale_jobs", detail);
  `;
  if (auditHealth(split).length !== 0)
    failures.push(`case2 FAIL — the split shape was flagged: ${auditHealth(split).join(" | ")}`);

  // Must satisfy the earlier checks first, or the early return hides this one — the fixture has to
  // reach the branch it is testing.
  const leaky = `
    if (mins === null) neverSucceeded.push(row.job_name);
    if (neverSucceeded.length > 0) throw new HealthCheckError("never_succeeded_jobs", detail);
    if (late.length > 0) throw new HealthCheckError(\`stale_\${row.job_name}\`, detail);
  `;
  if (!auditHealth(leaky).some((p) => p.includes("interpolated or variable")))
    failures.push("case3 FAIL — an interpolated public code was NOT caught");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case4 FAIL — real source flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — collapsed code caught, split shape clean, interpolated public code caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — never-succeeded jobs report distinctly from stale ones, names stay out of the public payload`);
}

main();
