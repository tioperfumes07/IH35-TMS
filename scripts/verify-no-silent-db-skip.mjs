#!/usr/bin/env node
// verify-no-silent-db-skip.mjs — ROUND 29.9-B owner ruling (2026-09-22), gate step 03d.
//
// "A live money guard that cannot connect is a FAIL, never a pass" — and any guard doing so
// silently reports GREEN to the whole gate while never having checked anything. Proof this was
// live, not theoretical: verify-faro-invoice-lines-load-linkage.mjs (wired, correct, asserts zero
// live faro_invoice_lines with load_id IS NULL) silently skip-passed with no DATABASE_URL while
// live prod carried 44 of 89 such rows — a real 70-line append passed a gate that would have
// caught it, because the guard never actually ran.
//
// METHOD: dynamic, not static. Every scripts/verify-*.mjs that mentions DATABASE_URL in its own
// source is actually RUN (spawned as a child process, DATABASE_URL/DATABASE_DIRECT_URL stripped
// from its environment, short timeout) and its REAL exit code is captured — this cannot be fooled
// by code-shape variety the way a regex/static scan can (that was tried first, live, this session;
// it left ~40% of cases misclassified "unclear"). A file exiting 0 under these conditions is
// exhibiting the silent-skip-as-pass anti-pattern.
//
// ENFORCEMENT — ratchet, never grows: scripts/lib/db-skip-baseline.json names every file already
// known to exhibit this pattern as of 2026-09-22 (161, live-verified the same way this guard checks
// live). A file in that baseline is a pre-existing debt, not re-flagged as new. A file NOT in the
// baseline that is caught exhibiting the pattern is a REAL REGRESSION and fails the gate — unless
// its own source declares `export const ALLOW_OFFLINE_SKIP = "<reason>";` (narrow, explicit, and
// per the owner ruling: "anything that touches money may NOT declare it" — this guard does not
// itself judge what counts as money; that call is made, and reviewed, by a human writing the
// declaration into the file, in the open, in a PR diff).
//
// The baseline may only shrink. If a run finds FEWER live violations than the baseline lists, it
// still PASSES but prints which names to remove from the baseline (so the baseline stays honest
// and does not silently protect an already-fixed file's old debt entry). If a run finds a name
// exhibiting the pattern that is not in the baseline and does not declare ALLOW_OFFLINE_SKIP, that
// is an immediate FAIL — the whole point of this guard.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-silent-db-skip";
const BASELINE_PATH = path.join(ROOT, "scripts/lib/db-skip-baseline.json");

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return new Set();
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  return new Set(parsed.files ?? []);
}

// Files whose live DB check only runs behind an explicit CLI flag (not invoked by a bare run) —
// hand-verified 2026-09-22 as part of converting them to fail-closed; run WITH the flag so this
// guard actually exercises the code path it exists to police, not just the always-static default.
const LIVE_FLAG_FILES = new Map([
  ["verify-acct-link-03-bill-unit-density.mjs", "--live"],
  ["verify-heavy-repair-expense-account.mjs", "--live"],
  ["verify-je-type-inbound-density.mjs", "--live"],
  // E7 batch 2c-2: static by default; their database half runs only with --live, and fails closed there.
  ["verify-factoring-recourse-window.mjs", "--live"],
  ["verify-fuel-overage-receivable-account.mjs", "--live"],
  ["verify-geofence-events-from-positions.mjs", "--live"],
  ["verify-intercompany-coa-8000-block.mjs", "--live"],
  ["verify-netpay-clearing-is-liability.mjs", "--live"],
  ["verify-samsara-driver-mirror-both-statuses.mjs", "--live"],
  ["verify-samsara-driver-mirror-complete.mjs", "--live"],
  ["verify-seed-script-usmca-cutover-floor.mjs", "--live"],
  ["verify-stops-geocoded.mjs", "--live"],
  ["verify-double-entry-balance-trigger.mjs", "--live"],
]);

// Not a lightweight money/data guard despite the verify- prefix and a DATABASE_URL mention — it
// spins up its own ephemeral local Postgres cluster and reproduces the full CI build-typecheck
// suite, a deliberate ~6-10 MINUTE dev workflow tool (docs/CLAUDE.md, npm run verify:local-ci).
// Spawning it here with any reasonable per-guard timeout can only ever time out, never pass —
// caught live: 8s timeout, 25s timeout, both hit, standalone run exceeded 120s outright.
const NOT_A_CANDIDATE = new Set(["verify-static.mjs", "verify-no-silent-db-skip.mjs", "verify-local-ci.mjs"]);

function candidateFiles() {
  return fs
    .readdirSync(path.join(ROOT, "scripts"))
    .filter((f) => f.startsWith("verify-") && f.endsWith(".mjs") && !NOT_A_CANDIDATE.has(f))
    .filter((f) => /DATABASE_URL/.test(fs.readFileSync(path.join(ROOT, "scripts", f), "utf8")));
}

// Async + concurrency-pooled (was sequential spawnSync — 192 files at ~0.25-0.4s each summed to
// ~50s wall-clock, blowing verify-static.mjs's own 25s per-guard timeout when this guard runs
// nested inside that full sweep; caught live during PR #22164/#22167). Same per-file semantics
// (exit0/timedOut/note), just N files in flight at once instead of one at a time.
function runsExit0(file, env) {
  return new Promise((resolve) => {
    const extraArg = LIVE_FLAG_FILES.get(file);
    const args = [path.join(ROOT, "scripts", file), ...(extraArg ? [extraArg] : [])];
    const child = spawn(process.execPath, args, { cwd: ROOT, env });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ exit0: false, timedOut: true, note: "timed out" });
    }, 8000);
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exit0: false, timedOut: false, note: `spawn error: ${err.message}` });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) resolve({ exit0: false, timedOut: true, note: `timed out / signal ${signal}` });
      else resolve({ exit0: code === 0, timedOut: false });
    });
  });
}

/** Bounded-concurrency map — runs at most `limit` promises from `fn` at once, in input order. */
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function declaresAllowOfflineSkip(file) {
  const src = fs.readFileSync(path.join(ROOT, "scripts", file), "utf8");
  return /export\s+const\s+ALLOW_OFFLINE_SKIP\s*=\s*["'`]/.test(src);
}

async function main() {
  const baseline = loadBaseline();
  const files = candidateFiles();

  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DATABASE_DIRECT_URL;

  const violations = [];
  const nowFixed = [];
  const timedOut = [];

  const outcomes = await mapPool(files, 16, (f) => runsExit0(f, env));

  files.forEach((f, i) => {
    const { exit0, timedOut: to, note } = outcomes[i];
    if (to) { timedOut.push({ f, note }); return; }
    if (!exit0) {
      if (baseline.has(f)) nowFixed.push(f); // was in baseline, no longer exhibits the pattern
      return;
    }
    // exit0 === true: exhibits the silent-skip pattern right now.
    if (baseline.has(f)) return; // known pre-existing debt, not a new regression
    if (declaresAllowOfflineSkip(f)) return; // explicitly, visibly declared — allowed
    violations.push(f);
  });

  if (timedOut.length > 0) {
    console.error(`${LABEL}: FAIL — ${timedOut.length} guard(s) hung instead of exiting when DATABASE_URL was stripped (a hang is not a pass either):`);
    for (const t of timedOut) console.error(`  - ${t.f} (${t.note})`);
    process.exit(1);
  }

  if (violations.length > 0) {
    console.error(`${LABEL}: FAIL — ${violations.length} guard(s) silently exit 0 with no DATABASE_URL, are NOT in the ratchet baseline, and do not declare ALLOW_OFFLINE_SKIP:`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error(`  Fix: convert to requireLiveDbOrExit() (scripts/lib/require-live-db.mjs), or if this genuinely never touches money data, add`);
    console.error(`  export const ALLOW_OFFLINE_SKIP = "<one-line reason>"; to the file itself.`);
    process.exit(1);
  }

  if (nowFixed.length > 0) {
    console.log(`${LABEL}: ${nowFixed.length} file(s) no longer exhibit the silent-skip pattern but are still listed in the baseline — remove from scripts/lib/db-skip-baseline.json to keep it honest:`);
    for (const f of nowFixed) console.log(`  - ${f}`);
  }

  console.log(`${LABEL}: PASS — ${files.length} DATABASE_URL-referencing guard(s) scanned live, ${baseline.size} pre-existing baseline debt (ratchets down only), 0 new silent-skip regressions.`);
}

await main();
