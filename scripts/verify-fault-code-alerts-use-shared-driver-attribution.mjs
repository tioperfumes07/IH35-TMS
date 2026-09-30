#!/usr/bin/env node
/**
 * ROUND 301 T-33 — GUARD.
 *
 * "Use CC-2's driverAtTimeSql from driver-attribution.ts. DO NOT re-inline the predicate - it was
 * independently inlined in 8 places before that helper existed and that is exactly the bug it
 * fixed."
 *
 * FAILS IF:
 *   1. fault-code-alerts.routes.ts or fault-code-processor.service.ts does not import and call
 *      driverAtTimeSql (the shared helper).
 *   2. either file contains its OWN copy of the assignment-window boundary predicate
 *      (started_at <= ... AND (ended_at IS NULL OR ended_at > ...)) instead of relying on the
 *      shared helper -- the exact regression class driver-attribution.ts exists to prevent.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILES = [
  "apps/backend/src/maintenance/fault-code-alerts.routes.ts",
  "apps/backend/src/integrations/samsara/fault-code-processor.service.ts",
];

const INLINE_PREDICATE_RE = /\w*\.?started_at\s*<=\s*\S+\s+AND\s*\(\s*\w*\.?ended_at\s+IS\s+NULL\s+OR\s+\w*\.?ended_at\s*>/i;

export function checkUsesSharedHelper(source, label) {
  const problems = [];
  if (!/driverAtTimeSql/.test(source)) {
    problems.push(`${label} does not reference driverAtTimeSql -- driver-at-time must resolve through the shared helper, not be resolved ad hoc or skipped.`);
  }
  if (!/from\s+["'].*driver-attribution\.js["']/.test(source)) {
    problems.push(`${label} does not import driver-attribution.js -- driverAtTimeSql must come from the shared module, not a local reimplementation.`);
  }
  return problems;
}

export function checkNoInlinePredicate(source, label) {
  const problems = [];
  if (INLINE_PREDICATE_RE.test(source)) {
    problems.push(
      `${label} contains its own copy of the assignment-window boundary predicate ` +
        `(started_at <= ... AND ended_at IS NULL OR ended_at > ...) -- this is the exact bug ` +
        `class driverAtTimeSql exists to prevent (independently inlined in 8 places before it ` +
        `existed). Use the shared helper's own SQL fragment, never a second copy.`
    );
  }
  return problems;
}

export function run() {
  const problems = [];
  for (const rel of FILES) {
    const file = resolve(ROOT, rel);
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      problems.push(`${rel} does not exist.`);
      continue;
    }
    problems.push(...checkUsesSharedHelper(source, rel));
    problems.push(...checkNoInlinePredicate(source, rel));
  }
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-fault-code-alerts-use-shared-driver-attribution: OK -- both files use the shared driverAtTimeSql helper, no re-inlined predicate."
        : `verify-fault-code-alerts-use-shared-driver-attribution FAILED:\n  - ${problems.join("\n  - ")}`,
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
    "uses shared helper",
    checkUsesSharedHelper('import { driverAtTimeSql } from "./driver-attribution.js"; driverAtTimeSql("x","y");', "test"),
    false
  );
  expect("missing import", checkUsesSharedHelper("driverAtTimeSql(x, y);", "test"), true);
  expect("missing call entirely", checkUsesSharedHelper("const x = 1;", "test"), true);

  expect("clean, no inline predicate", checkNoInlinePredicate("SELECT driverAtTimeSql(a, b)", "test"), false);
  expect(
    "inline predicate sneaks back in",
    checkNoInlinePredicate("WHERE a.started_at <= $2 AND (a.ended_at IS NULL OR a.ended_at > $2)", "test"),
    true
  );

  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const passed = selftest();
    console.log(passed ? "verify-fault-code-alerts-use-shared-driver-attribution selftest PASS" : "verify-fault-code-alerts-use-shared-driver-attribution selftest FAIL");
    process.exit(passed ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
