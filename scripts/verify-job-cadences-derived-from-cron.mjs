#!/usr/bin/env node
/**
 * OPS-F75 — every scheduled job's staleness rule must match the cron expression its own file declares.
 *
 * WHY: 49 of 72 registered jobs had no rule at all, so the health check skipped them
 * (`if (!rule) continue`). OPS-F69 made "never succeeded" rule-independent; this guard protects the
 * remaining late-vs-on-time layer, where a threshold is only meaningful if it reflects the REAL
 * schedule.
 *
 * The failure this prevents is drift, not absence: someone changes cron.schedule("*\/5 * * * *") to
 * "0 3 * * *" and leaves maxStaleMinutes at 10, so a job that now runs nightly alarms every single
 * day — and a permanently-red check is what taught everyone to ignore this one before. The reverse is
 * worse and quieter: tighten the schedule, leave a 48h window, and a job that stops for a day and a
 * half says nothing.
 *
 * Rule: maxStaleMinutes must be >= 2x the declared interval (alarm only after two consecutive misses)
 * and must not exceed 4x (or the window is so loose it stops meaning anything).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HEALTH = "apps/backend/src/health/health.routes.ts";
const LABEL = "verify-job-cadences-derived-from-cron";

export function intervalMinutes(expr) {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [m, h, dom, , dow] = f;
  if (m.startsWith("*/")) return Number(m.slice(2));
  if (m === "*") return 1;
  if (h.startsWith("*/")) return Number(h.slice(2)) * 60;
  if (h === "*") return 60;
  const hours = h.includes(",") ? h.split(",").length : 1;
  if (dom === "*" && dow === "*") return Math.round((24 * 60) / hours);
  if (dow !== "*" && dom === "*") return 7 * 24 * 60;
  if (dom !== "*") return 31 * 24 * 60;
  return null;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) {
      if (e === "node_modules" || e === "dist") continue;
      walk(full, out);
    } else if (e.endsWith(".ts") && !e.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** job_name -> declared cron expression, read from the job's own source. */
export function declaredSchedules() {
  const map = new Map();
  for (const full of walk(join(ROOT, "apps/backend/src"))) {
    const src = readFileSync(full, "utf8");
    const names = new Set([
      ...[...src.matchAll(/wrapBackgroundJobTick\(\s*"([^"]+)"/g)].map((m) => m[1]),
      ...[...src.matchAll(/CRON_NAME\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
    ]);
    if (names.size === 0) continue;
    const exprs = [
      ...new Set(
        [
          ...[...src.matchAll(/cron\.schedule\(\s*"([^"]+)"/g)].map((m) => m[1]),
          ...[...src.matchAll(/CRON_EXPRESSION\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
        ].filter((e) => e.trim().split(/\s+/).length === 5)
      ),
    ];
    // ONLY an unambiguous file yields a trustworthy pairing. A file declaring several jobs and several
    // schedules cannot be resolved by position: an earlier version of this extractor took exprs[0] for
    // every name and mis-paired four reconciliation jobs, then reported five sound thresholds as
    // defects. Ambiguous files are skipped rather than guessed.
    if (names.size !== 1 || exprs.length !== 1) continue;
    map.set([...names][0], exprs[0]);
  }
  return map;
}

/** job_name -> maxStaleMinutes, read from backgroundJobRule's switch. */
export function declaredRules(src) {
  const map = new Map();
  const re = /case\s+"([a-z0-9_.]+)":([\s\S]{0,400}?)return\s*(?:null|\{[^}]*maxStaleMinutes:\s*(\d+)[^}]*\})/g;
  for (const m of src.matchAll(re)) {
    if (m[3]) map.set(m[1], Number(m[3]));
  }
  return map;
}

export function auditCadences(schedules, rules) {
  const problems = [];
  for (const [job, thr] of rules) {
    const expr = schedules.get(job);
    if (!expr) continue; // no declared cron (interval-driven or externally triggered) — nothing to compare
    const iv = intervalMinutes(expr);
    if (!iv) continue;
    // ONLY the unambiguous defect is policed: a window SHORTER than the job's own period means the
    // job can never once be considered fresh — a guaranteed permanent alarm, which is precisely the
    // always-red noise that teaches people to ignore this check.
    //
    // Anything above one period is a JUDGMENT CALL and is deliberately left alone. An earlier draft
    // of this guard enforced a 2x–4x band and flagged 13 existing rules — including a 1-minute email
    // queue processor with a 5-minute window and a daily job with a 26h window, both of which are
    // sensible, hand-tuned SLAs. A guard that overrides considered judgment with an arbitrary ratio
    // would have forced real monitoring to be LOOSENED to satisfy it.
    if (thr < iv) {
      problems.push(
        `${HEALTH}: '${job}' runs every ${iv}m ("${expr}") but its maxStaleMinutes is ${thr} — SHORTER ` +
          `than one period, so the job is stale by construction and this check can never be green for it.`
      );
    }
  }
  return problems;
}

function auditTree() {
  return auditCadences(declaredSchedules(), declaredRules(readFileSync(join(ROOT, HEALTH), "utf8")));
}

function selftest() {
  const failures = [];
  if (intervalMinutes("*/5 * * * *") !== 5) failures.push("case1 FAIL — */5 not parsed as 5m");
  if (intervalMinutes("0 3 * * *") !== 1440) failures.push("case2 FAIL — daily not parsed as 1440m");
  if (intervalMinutes("0 3 * * 1") !== 10080) failures.push("case3 FAIL — weekly not parsed as 10080m");
  const sched = new Map([["j", "*/5 * * * *"]]);
  if (auditCadences(sched, new Map([["j", 4]])).length === 0) failures.push("case4 FAIL — a window shorter than the period was NOT caught");
  if (auditCadences(sched, new Map([["j", 999]])).length !== 0) failures.push("case5 FAIL — a deliberately loose window was flagged (judgment, not a defect)");
  if (auditCadences(sched, new Map([["j", 5]])).length !== 0) failures.push("case6 FAIL — a tighter-than-2x but valid window was flagged");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case7 FAIL — real source flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — interval parsing, too-tight caught, too-loose caught, correct window clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every job rule matches the cron expression its own file declares`);
}

main();
