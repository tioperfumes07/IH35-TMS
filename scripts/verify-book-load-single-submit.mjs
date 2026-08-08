#!/usr/bin/env node
/**
 * FAIL-B5 — Book Load must not be able to create the same load twice.
 *
 * The modal had NO in-flight state at all: no `isSubmitting` tracking, no re-entry guard, and the submit
 * button's `disabled` covered only the repair-block and credit-limit gates. A second click re-entered
 * `submitLoad` and issued a SECOND create — the load was booked AND dispatched twice.
 *
 * FIVE controls call `form.handleSubmit(...)` in this file, so guarding a single button is not sufficient.
 * This asserts the guard sits at the choke point every path funnels through, AND that it is released in a
 * `finally` (a guard that latches on a thrown submit wedges the form shut, which is its own outage).
 *
 *   node scripts/verify-book-load-single-submit.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-book-load-single-submit";
const MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

function assert(files) {
  const m = files[MODAL] ?? "";
  const problems = [];
  if (!/submitInFlightRef/.test(m)) {
    problems.push(`${MODAL}: no in-flight ref — a second click re-enters submitLoad and books the load twice`);
  }
  if (!/if \(submitInFlightRef\.current\) return;/.test(m)) {
    problems.push(`${MODAL}: submitLoad must return early while a submit is already in flight`);
  }
  if (!/finally\s*\{[\s\S]{0,200}submitInFlightRef\.current = false;/.test(m)) {
    problems.push(`${MODAL}: the in-flight ref must be released in a finally, or a failed submit wedges the form shut`);
  }
  if (!/disabled=\{form\.formState\.isSubmitting/.test(m)) {
    problems.push(`${MODAL}: the submit button must also disable while submitting (visible affordance)`);
  }
  return problems;
}

const files = Object.fromEntries([MODAL].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  const checks = [
    ["re-entry check removed", { [MODAL]: files[MODAL].replace(/if \(submitInFlightRef\.current\) return;/, "") }],
    ["finally release removed", { [MODAL]: files[MODAL].replace(/submitInFlightRef\.current = false;/, "") }],
    ["button disable reverted", { [MODAL]: files[MODAL].replace(/disabled=\{form\.formState\.isSubmitting \|\| /, "disabled={") }],
  ];
  for (const [name, planted] of checks) {
    if (!assert(planted).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted "${name}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted breaks caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — Book Load guards re-entry at the choke point and releases it in a finally`);
process.exit(0);
