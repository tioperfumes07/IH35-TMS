#!/usr/bin/env node
/**
 * GUARD: PROD-OUTAGE-EXECSYNC-EVENT-LOOP-BLOCK / PROD-API-INTERMITTENT-502-BURST-STILL-RECURRING
 * @matrix-built leaf:program.matrix col:connectivity
 *
 * execSync (and any synchronous fs call — readFileSync/writeFileSync/existsSync/readdirSync/
 * statSync) blocks the ENTIRE Node event loop. On 2026-08-21 `git log` ran via execSync inside the
 * audit-scoreboard request handler with `timeout: 8_000` — an 8s block against Render's 5s health
 * check. Render marked every instance unhealthy and SIGTERM-killed it in a loop (nonZeroExit 143,
 * evicted:false), producing hours of 502s with ZERO app error logs and ZERO database activity,
 * because requests never reached either. Even the trivial GET /api/v1/_healthcheck timed out.
 * That fix (async execFile + a cache) shipped in #13442, but the SAME class recurred live: CC-2
 * live-discovered a 502 burst AFTER #13442 deployed, root-caused to the "16 remaining synchronous
 * filesystem reads of the ledger markdown" #13442's own REMAINING note named in these same two
 * files — a sync fs call anywhere in the process blocks every OTHER concurrent request too,
 * including a trivial healthz check, not just the route that made the call.
 *
 * Rule: no `git log` via execSync in these hot-path files (the deployed SHA must be memoized —
 * it cannot change during a process lifetime — and read from RENDER_GIT_COMMIT first), and no
 * synchronous fs I/O of any kind. Use node:fs/promises (readFile/writeFile/access) instead.
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

// Strip comments and string/template literals first — a mention of "readFileSync" in a comment
// or a PROD-API-INTERMITTENT-502-BURST-STILL-RECURRING note (this file's own header, or the
// source files' own explanatory comments) must never trip the detector; only a REAL call does.
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:[^`\\]|\\.)*`/gs, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

const SYNC_FS_APIS = ["readFileSync", "writeFileSync", "existsSync", "readdirSync", "statSync", "lstatSync", "appendFileSync", "mkdirSync"];

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
  // 4. PROD-API-INTERMITTENT-502-BURST-STILL-RECURRING — no synchronous fs I/O at all. A sync fs
  // call blocks the whole event loop for every request being served, not just its own caller.
  const code = stripNonCode(src);
  for (const api of SYNC_FS_APIS) {
    const re = new RegExp(`\\b${api}\\s*\\(`);
    if (re.test(code)) {
      fail(`${rel}: synchronous fs.${api}(...) call present — blocks the whole event loop. Use node:fs/promises instead.`);
    }
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

  // PROD-API-INTERMITTENT-502-BURST-STILL-RECURRING selftest: a reintroduced sync fs call is
  // caught, and a comment merely NAMING the API (e.g. this file's own header prose) is not.
  const syncFsBug = 'export function readCache(p) {\n  return JSON.parse(readFileSync(p, "utf8"));\n}';
  const strippedBug = stripNonCode(syncFsBug);
  if (!/\breadFileSync\s*\(/.test(strippedBug)) {
    fail("selftest: sync-fs bug variant does not match the detector — guard would miss the regression.");
  }
  const commentOnly = '// was readFileSync before the fix, now uses readFile\nexport function readCache(p) {\n  return readFile(p, "utf8");\n}';
  const strippedComment = stripNonCode(commentOnly);
  if (/\breadFileSync\s*\(/.test(strippedComment)) {
    fail("selftest: a comment merely naming readFileSync false-positived — stripNonCode is broken.");
  }
  console.log(`${LABEL} selftest OK — guard detects execSync("git log") and any reintroduced sync fs call; comments naming the API do not false-positive.`);
}

console.log(`${LABEL} OK — no synchronous git on the request path; SHA memoized and env-first.`);
