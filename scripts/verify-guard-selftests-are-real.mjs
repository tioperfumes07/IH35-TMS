#!/usr/bin/env node
/**
 * GR-2 META-GUARD (FW11 / CERT-01 slice B3): does every guard's `--selftest` prove something?
 *
 * REBUILT 2026-08-29 per IH35-FINISH-2026-08-29/CC-2/4-FW11-CORRECTED-SPEC.txt — a direct, verified
 * correction to the first version of this file (PRs #17860 claim + #17863 build). That correction is
 * load-bearing on this design, so it is recorded here rather than only in a commit message:
 *
 * The first version judged "is this selftest real?" with a STATIC source-heuristic (does the extracted
 * body call an assertion / read repo source / can it exit non-zero). The corrected-spec author tried
 * exactly that category of approach across all 4,568 guards in this repo and got an 8x swing between
 * two regex revisions (6.2% "real" -> 49.3% "real") from two documented false-negative modes: a planted
 * check whose failure path didn't match the regex's exact shape, and a `selftest()` function defined
 * above the line the extractor started reading from. Their conclusion, verified against this repo's own
 * guards: **source heuristics cannot answer this question** — the reading itself produces confident
 * wrong numbers, which is exactly the defect FW11 exists to eliminate.
 *
 * Independently re-running that same category of check against verify-a5-audit-emit-banking.mjs live
 * (2026-08-29, this rebuild) reproduced their finding directly: --selftest plants a real mutation (a
 * fire-and-forget spine-emit rewrite) and asserts it is caught, exits 0 on success — but its stdout
 * never states a machine-parseable "this many mutations, this many caught" report. A detector that
 * requires such a report will not credit this guard as verified, even though it is doing real work; a
 * detector that instead re-reads the source to guess intent is back in exactly the failure mode above.
 * There is no third option that is both execution-based and lossless across every guard's own prose. So
 * this guard accepts the conservative side of that trade explicitly (see "WHAT THIS DOES NOT CLAIM").
 *
 * WHAT THIS GUARD ACTUALLY GATES (cheap, static, runs every push, Rule 25 fail-fast):
 * A guard either has a `--selftest` arm (an `argv.includes("--selftest")`/`argv.indexOf(...)` dispatch)
 * or it does not. That single fact is measured by presence, not by reading what the arm does — there is
 * nothing to misjudge. Guards with NO `--selftest` arm at all are WEAK by definition (a check with no
 * self-test can silently rot with zero warning). The WEAK list is a SHRINK-ONLY ratchet, same contract
 * as verify-static-ratchet.mjs: `scripts/verify-guard-selftests-are-real-weak-baseline.json` is a
 * snapshot of which guards were weak as of the baseline measurement; CI fails if any guard NOT already
 * on that list is weak today (a guard losing its --selftest arm, or a new guard shipping without one).
 * Fixing one and removing it from the baseline is a small file diff.
 *
 * WHAT THIS GUARD MEASURES BUT DOES NOT GATE (expensive, execution-based, `--full-scan` only):
 * For guards that DO have a `--selftest` arm, this runs `node <guard> --selftest` for real (isolated
 * from any reachable database, same sentinel pattern as verify-static.mjs) and classifies by what that
 * execution actually produced — never by reading source:
 *   - `currently_broken`   — the selftest's own exit code is non-zero right now (an objective fact).
 *   - `verified_mutation_tested` — exit 0, AND some line of its combined stdout+stderr both mentions
 *     "selftest" (case-insensitive) and reports an N/M count with N === M and M >= 1 (e.g. `SELFTEST
 *     caught 3/3 planted regressions`, `SELFTEST PASS: 9/9 planted defects`, `SELFTEST: 2/2 shared-
 *     driver mutations`) — self-reported, machine-parsed evidence that a real mutation was constructed,
 *     checked, and would have failed the run had it survived. 854 guards in this repo already use a
 *     `mutations = [...]` construct-and-check array (`verify-a2-audit-emit-dispatch.mjs` is the named
 *     reference); this is the population that can satisfy this bucket today.
 *   - `no_mutation_evidence` — exit 0, arm present, but no line matched that pattern. **This is NOT a
 *     claim that the selftest is fake** (verify-a5-audit-emit-banking.mjs above is the proof: it is
 *     doing real mutation work and lands here anyway, because it never prints a count). It means only
 *     "this run did not offer execution-observable evidence," which is the honest, conservative label —
 *     the alternative (reading its source to decide) is the exact thing this rebuild exists to stop.
 * These three buckets are reported by `--full-scan` for visibility and burndown planning. None of them
 * gates CI. Gating a measurement this noisy is how the first version produced a number nobody could
 * stand behind; not gating it, and saying so here, is the corrected design.
 *
 * Wired via `scripts/verify-steps/` only (Rule 17) — never `package.json`, `ci.yml`, `locked-guards.yml`.
 * verify-step 10051 already claimed+merged under this filename (PR #17860) — this is a same-file
 * rewrite, not a new authorship, so no new CLAIMED-NUMBERS.json entry is taken (Rule 37 governs new
 * claims; this isn't one).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const SELF_PATH = fileURLToPath(import.meta.url);
const SELF_NAME = path.basename(SELF_PATH);
const BASELINE_FILE = path.join(SCRIPTS, "verify-guard-selftests-are-real-weak-baseline.json");
const LABEL = "verify-guard-selftests-are-real";
const WRITE_BASELINE = process.argv.includes("--write-baseline");
const FULL_SCAN = process.argv.includes("--full-scan") || WRITE_BASELINE;
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === SELF_PATH;

// ---------------------------------------------------------------------------------------------
// Cheap, static, gated: does this guard have a --selftest arm at all? Presence only — never a
// judgment about what the arm does once found (that question is answered by running it, below).
export function hasSelftestArm(source) {
  return /\bargv\s*(?:\.includes\s*\(\s*["']--selftest["']\s*\)|\.indexOf\s*\(\s*["']--selftest["']\s*\))/.test(
    source,
  );
}

function listGuardFiles(dir = SCRIPTS, self = SELF_NAME) {
  return fs.readdirSync(dir).filter((f) => /^verify-.*\.mjs$/.test(f) && f !== self).sort();
}

/** Names of every guard with no `--selftest` arm at all — cheap (no spawning), runs every push. */
export function measureWeak({ dir = SCRIPTS, self = SELF_NAME, readSource } = {}) {
  const read = readSource ?? ((f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } });
  const weak = [];
  for (const file of listGuardFiles(dir, self)) {
    const src = read(path.join(dir, file));
    if (!hasSelftestArm(src)) weak.push(file);
  }
  return weak.sort();
}

// ---------------------------------------------------------------------------------------------
// Expensive, execution-based, informational only: run --selftest for real and parse what it says
// about itself. Never reads source to guess — the classification comes only from the child
// process's own exit code and its own printed output.

/** Same no-reachable-database isolation as verify-static.mjs's noDbEnv(). Duplicated deliberately
 *  (small, self-contained) rather than importing a private, unexported helper. */
function noDbEnv(extraEnv = process.env) {
  const env = { ...extraEnv };
  const SENTINEL = "postgresql://verify_guard_selftests:none@127.0.0.1:59999/verify_guard_selftests_none";
  env.DATABASE_URL = SENTINEL;
  env.DATABASE_DIRECT_URL = SENTINEL;
  env.PGHOST = "127.0.0.1";
  env.PGPORT = "59999";
  env.PGUSER = "verify_guard_selftests";
  env.PGDATABASE = "verify_guard_selftests_none";
  env.PGCONNECT_TIMEOUT = "2";
  return env;
}

/** Run `node <file> --selftest`, isolated from any real database, 20s timeout. */
export function runSelftest(file, { env = process.env, timeout = 20000 } = {}) {
  const res = spawnSync(process.execPath, [file, "--selftest"], {
    env: noDbEnv(env),
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: res.status,
    out: `${res.stdout || ""}${res.stderr || ""}`,
    spawnError: res.error,
    timedOut: res.error?.code === "ETIMEDOUT",
  };
}

/** Does this --selftest output self-report at least one N/M mutation count with N === M >= 1, on a
 *  line that also mentions "selftest"? Whole-line match (not a fixed lookback window) so the count
 *  and the keyword can appear in either order — real guards in this repo do both
 *  ("SELFTEST caught 3/3 ..." and "SELFTEST: 2/2 shared-driver mutations"). */
export function parseMutationReport(output) {
  for (const line of output.split("\n")) {
    if (!/selftest/i.test(line)) continue;
    const m = /(\d+)\s*\/\s*(\d+)/.exec(line);
    if (!m) continue;
    const [n, total] = [Number(m[1]), Number(m[2])];
    if (total >= 1 && n === total) return { line: line.trim(), n, total };
  }
  return null;
}

/** Classify one guard that has a --selftest arm, by running it. Pure w.r.t. the child-process
 *  boundary passed in via options (testable without touching the real scripts/ directory). */
export function classifyByExecution(file, { runner = runSelftest } = {}) {
  const dyn = runner(file);
  if (dyn.status !== 0) {
    const detail = dyn.timedOut
      ? "timed out (20s) — waiting on something unreachable in this isolated sweep"
      : dyn.spawnError
        ? `spawn error: ${dyn.spawnError.message}`
        : (dyn.out.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "").slice(0, 200);
    return { bucket: "currently_broken", reason: detail };
  }
  const report = parseMutationReport(dyn.out);
  if (report) return { bucket: "verified_mutation_tested", reason: report.line };
  return { bucket: "no_mutation_evidence", reason: "exits 0 but printed no parseable SELFTEST N/M report" };
}

/** Full sweep: every guard with a --selftest arm, actually run. Minutes, not seconds — this is why
 *  it is not the default (per-push) invocation; see the module header. */
export function fullScan({ dir = SCRIPTS, self = SELF_NAME, readSource, runner = runSelftest } = {}) {
  const read = readSource ?? ((f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } });
  const weak = [];
  const verifiedMutationTested = [];
  const noMutationEvidence = [];
  const currentlyBroken = [];
  for (const file of listGuardFiles(dir, self)) {
    const full = path.join(dir, file);
    const src = read(full);
    if (!hasSelftestArm(src)) { weak.push(file); continue; }
    const { bucket } = classifyByExecution(full, { runner });
    if (bucket === "verified_mutation_tested") verifiedMutationTested.push(file);
    else if (bucket === "no_mutation_evidence") noMutationEvidence.push(file);
    else currentlyBroken.push(file);
  }
  return {
    weak: weak.sort(),
    verifiedMutationTested: verifiedMutationTested.sort(),
    noMutationEvidence: noMutationEvidence.sort(),
    currentlyBroken: currentlyBroken.sort(),
  };
}

// ---------------------------------------------------------------------------------------------
// Own planted-failure selftest — execution-based, matching this file's own contract: a real
// mutation, checked, self-reported as an N/M count on a line mentioning "selftest".
function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-guard-selftests-are-real-selftest-"));
  try {
    const checks = [];

    checks.push([
      "hasSelftestArm(): true for a real argv.includes('--selftest') dispatch",
      hasSelftestArm("if (process.argv.includes('--selftest')) { doThing(); }") === true,
    ]);
    checks.push([
      "hasSelftestArm(): false when the guard never dispatches on --selftest",
      hasSelftestArm("console.log('no selftest arm here at all');") === false,
    ]);

    checks.push([
      "parseMutationReport(): catches 'SELFTEST caught 3/3 planted regressions'",
      (() => {
        const r = parseMutationReport("[verify-x] SELFTEST caught 3/3 planted regressions");
        return r !== null && r.n === 3 && r.total === 3;
      })(),
    ]);
    checks.push([
      "parseMutationReport(): catches 'SELFTEST: 2/2 shared-driver mutations' (count before keyword order n/a, same line)",
      (() => {
        const r = parseMutationReport("SELFTEST: 2/2 shared-driver mutations");
        return r !== null && r.n === 2 && r.total === 2;
      })(),
    ]);
    checks.push([
      "parseMutationReport(): rejects a partial catch (1/2 — a real mutation survived)",
      parseMutationReport("SELFTEST caught 1/2 planted regressions") === null,
    ]);
    checks.push([
      "parseMutationReport(): rejects an N/M report with no 'selftest' keyword on the line (not this guard's business)",
      parseMutationReport("unrelated line reports 3/3 for something else") === null,
    ]);
    checks.push([
      "parseMutationReport(): rejects plain 'ALL CHECKS PASSED' with no count (verify-a5's own shape)",
      parseMutationReport("[verify-a5] ALL CHECKS PASSED") === null,
    ]);

    // classifyByExecution against three planted fixtures: real (reports N/M), silent-but-real
    // (verify-a5's own shape — exits 0, no report), and broken (exits 1).
    fs.writeFileSync(
      path.join(tmp, "verify-mutation-fixture.mjs"),
      [
        "console.log('SELFTEST caught 2/2 planted mutations');",
        "process.exit(0);",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(tmp, "verify-silent-fixture.mjs"),
      ["console.log('ALL CHECKS PASSED');", "process.exit(0);", ""].join("\n"),
    );
    fs.writeFileSync(
      path.join(tmp, "verify-broken-fixture.mjs"),
      ["console.error('SELFTEST FAIL: 1/2 caught');", "process.exit(1);", ""].join("\n"),
    );

    const mutationVerdict = classifyByExecution(path.join(tmp, "verify-mutation-fixture.mjs"));
    const silentVerdict = classifyByExecution(path.join(tmp, "verify-silent-fixture.mjs"));
    const brokenVerdict = classifyByExecution(path.join(tmp, "verify-broken-fixture.mjs"));

    checks.push(["classifyByExecution(): reporting fixture -> verified_mutation_tested", mutationVerdict.bucket === "verified_mutation_tested"]);
    checks.push(["classifyByExecution(): silent-but-exit-0 fixture -> no_mutation_evidence (not falsely 'fake')", silentVerdict.bucket === "no_mutation_evidence"]);
    checks.push(["classifyByExecution(): non-zero-exit fixture -> currently_broken", brokenVerdict.bucket === "currently_broken"]);

    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length) {
      console.error(`${LABEL} --selftest FAILED:`);
      for (const [name] of failed) console.error(`  ✗ ${name}`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST caught ${checks.length}/${checks.length} planted mutations`);
    process.exit(0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Fast, no-spawning check for the default (per-push) invocation: current WEAK list must be a
 *  subset of the committed baseline (shrink-only ratchet — same contract as
 *  verify-static-ratchet.mjs). This is the ONLY thing CI gates on every push; see module header
 *  for why the execution-based buckets are measured but not gated. */
function checkWeakRatchet() {
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  } catch (e) {
    console.error(
      `${LABEL} FAILED — ${path.basename(BASELINE_FILE)} missing or invalid JSON (${e.message}). ` +
      `Run: node ${path.relative(ROOT, SELF_PATH)} --write-baseline`,
    );
    process.exit(1);
  }
  if (!Array.isArray(baseline.weak)) {
    console.error(`${LABEL} FAILED — ${path.basename(BASELINE_FILE)} is missing a weak[] array.`);
    process.exit(1);
  }
  const baselineWeak = new Set(baseline.weak);
  const currentWeak = measureWeak();
  const newWeak = currentWeak.filter((f) => !baselineWeak.has(f));
  const fixed = baseline.weak.filter((f) => !currentWeak.includes(f));

  if (fixed.length) {
    console.log(`${LABEL}: ${fixed.length} guard(s) gained a --selftest arm since baseline (remove from baseline, shrink-only):`);
    for (const f of fixed) console.log(`  ✓ ${f}`);
  }
  if (newWeak.length) {
    console.error(`${LABEL} FAILED — ${newWeak.length} guard(s) have NO --selftest arm and are not on the baseline:`);
    for (const f of newWeak) console.error(`  ${f}`);
    console.error(`Adding to the baseline is tampering, not a fix — give the guard a --selftest arm instead.`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — no NEW weak (no-selftest-arm) guards. ${currentWeak.length} of ${listGuardFiles().length} ` +
    `total guards are weak (tracked baseline; shrink-only). Run with --full-scan for the execution-based ` +
    `verified_mutation_tested / no_mutation_evidence / currently_broken breakdown (not gated; minutes, not seconds).`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
if (isDirectRun) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else if (!FULL_SCAN) {
    checkWeakRatchet();
  } else {
    const result = fullScan();

    if (WRITE_BASELINE) {
      fs.writeFileSync(
        BASELINE_FILE,
        JSON.stringify(
          {
            note:
              "Guards with no --selftest arm at all (measured by presence, not by reading what an arm " +
              "does). SHRINK-ONLY ratchet gated every push. Give a guard a --selftest arm and remove its " +
              "line here — never add a line to make CI pass.",
            measured_at: new Date().toISOString(),
            weak: result.weak,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(`${LABEL}: weak baseline written — ${result.weak.length} guards with no --selftest arm.`);
    }

    const total = result.weak.length + result.verifiedMutationTested.length + result.noMutationEvidence.length + result.currentlyBroken.length;
    console.log(`${LABEL} --full-scan — ${total} guards measured:`);
    console.log(`  weak (no --selftest arm):            ${result.weak.length}`);
    console.log(`  verified_mutation_tested (has N/M):  ${result.verifiedMutationTested.length}`);
    console.log(`  no_mutation_evidence (exit 0, silent): ${result.noMutationEvidence.length}`);
    console.log(`  currently_broken (--selftest fails):  ${result.currentlyBroken.length}`);
    console.log(`These three execution-based buckets are informational only — see module header for why.`);
  }
}
