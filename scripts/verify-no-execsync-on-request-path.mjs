#!/usr/bin/env node
/**
 * GUARD: PROD-OUTAGE-EXECSYNC-EVENT-LOOP-BLOCK
 * @matrix-built leaf:program.matrix col:connectivity
 *
 * execSync blocks the ENTIRE Node event loop. On 2026-08-21 `git log` ran via execSync inside the
 * audit-scoreboard request handler with `timeout: 8_000` — an 8s block against Render's 5s health
 * check. Render marked every instance unhealthy and SIGTERM-killed it in a loop (nonZeroExit 143,
 * evicted:false), producing hours of 502s with ZERO app error logs and ZERO database activity,
 * because requests never reached either. Even the trivial GET /api/v1/_healthcheck timed out.
 *
 * Rule: no `git log` via execSync in these hot-path files, and the deployed SHA must be memoized
 * (it cannot change during a process lifetime) and read from RENDER_GIT_COMMIT first.
 *
 * Fails on the bug. Passes on the fix.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-no-execsync-on-request-path";
const FILES = [
  "apps/backend/src/program/audit-scoreboard.routes.ts",
  "apps/backend/src/program/module-matrix.service.ts",
];

function fail(msg) {
  console.error(`${LABEL} FAILED — ${msg}`);
  process.exit(1);
}

function check(src, rel) {
  // 1. `git log` must never be synchronous here.
  if (/execSync\(\s*[`"'][^`"']*git log/.test(src)) {
    fail(`${rel}: execSync("git log ...") is on the request path — an 8s block vs Render's 5s health timeout. Use execFile async + cache.`);
  }
  // 2. Any remaining execSync must be memoized (once per process), never per request.
  if (/execSync\(/.test(src) && !/tipShaMemo/.test(src)) {
    fail(`${rel}: execSync present without the tipShaMemo memo guard — it would run per request.`);
  }
  // 3. Deployed SHA must prefer the platform env var over spawning git.
  if (/execSync\(/.test(src) && !/RENDER_GIT_COMMIT/.test(src)) {
    fail(`${rel}: execSync present but RENDER_GIT_COMMIT is not consulted first; git should never run on Render.`);
  }
}

for (const rel of FILES) {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  check(fs.readFileSync(p, "utf8"), rel);
}

// The async replacement must actually exist.
const a = fs.readFileSync(path.join(process.cwd(), FILES[0]), "utf8");
if (!/execFileAsync\(\s*\n?\s*"git"/.test(a) && !/execFileAsync\(/.test(a)) {
  fail(`${FILES[0]}: no execFileAsync git call — the non-blocking replacement is missing.`);
}
if (!/recentGitCache/.test(a)) {
  fail(`${FILES[0]}: no recentGitCache — the handler would respawn git per request.`);
}

if (process.argv.includes("--selftest")) {
  const bug = a.replace(
    /export function readRecentActivityFromGitLog[\s\S]*?\n}/,
    'export function readRecentActivityFromGitLog(limit = 10) {\n  const raw = execSync(`git log origin/main -n ${limit}`, { timeout: 8000 });\n  return [];\n}',
  );
  if (bug === a) fail("selftest could not construct the bug variant.");
  if (!/execSync\(\s*[`"'][^`"']*git log/.test(bug)) {
    fail("selftest: bug variant does not match the detector — guard would miss the regression.");
  }
  console.log(`${LABEL} selftest OK — guard detects execSync("git log") reintroduced on the request path.`);
}

console.log(`${LABEL} OK — no synchronous git on the request path; SHA memoized and env-first.`);
