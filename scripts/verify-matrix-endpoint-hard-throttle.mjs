#!/usr/bin/env node
/**
 * GUARD: PROD-OUTAGE-MATRIX-POLL-STORM-STARVES-API
 * @matrix-built leaf:program.matrix col:connectivity
 *
 * /api/v1/program/module-matrix must carry a HANDLER-LEVEL per-IP cap, not only the
 * `config.rateLimit` plugin declaration. On 2026-08-21 that plugin declaration was present
 * (max 60/min) yet 150 parallel requests to production returned ZERO 429s, and an unthrottled
 * ~71 req/s of a 223 KB payload starved the event loop until Render SIGTERM-killed every
 * instance (29 server_failed / nonZeroExit 143 / evicted:false).
 *
 * Fails on the bug: handler has no throttle call, or the cap is absent/too high.
 * Passes on the fix: throttle is invoked in the handler and replies 429.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-matrix-endpoint-hard-throttle";
const FILE = "apps/backend/src/program/audit-scoreboard.routes.ts";
const MAX_ALLOWED = 60;

function fail(msg) {
  console.error(`${LABEL} FAILED — ${msg}`);
  process.exit(1);
}

const src = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");

if (!/function matrixThrottleExceeded\s*\(/.test(src)) {
  fail("no matrixThrottleExceeded() — the handler-level cap is missing; config.rateLimit alone did NOT fire in prod.");
}
if (!/if\s*\(\s*matrixThrottleExceeded\(/.test(src)) {
  fail("matrixThrottleExceeded() is defined but never called inside the route handler.");
}
if (!/reply\.code\(429\)/.test(src)) {
  fail("throttle does not reply 429.");
}
const m = src.match(/const MATRIX_MAX_PER_MIN\s*=\s*(\d+)/);
if (!m) fail("MATRIX_MAX_PER_MIN not found.");
const max = Number(m[1]);
if (!Number.isFinite(max) || max <= 0) fail(`MATRIX_MAX_PER_MIN invalid: ${m[1]}`);
if (max > MAX_ALLOWED) {
  fail(`MATRIX_MAX_PER_MIN=${max} exceeds ${MAX_ALLOWED}/min; the board polls every 30s (2/min).`);
}
if (!/matrixHits\.size\s*>\s*[\d_]+/.test(src)) {
  fail("throttle map is unbounded — a spoofed-header flood could grow it without limit.");
}

if (process.argv.includes("--selftest")) {
  const broken = src.replace(/if\s*\(\s*matrixThrottleExceeded\(/, "if (false && matrixThrottleExceeded(");
  if (broken === src) fail("selftest could not construct the bug variant.");
  if (/if\s*\(\s*matrixThrottleExceeded\(/.test(broken)) {
    fail("selftest: bug variant still matches the guard — guard would not catch the regression.");
  }
  console.log(`${LABEL} selftest OK — guard rejects a handler with the throttle disabled.`);
}

console.log(`${LABEL} OK — handler-level per-IP cap present (${max}/min), replies 429, map bounded.`);
