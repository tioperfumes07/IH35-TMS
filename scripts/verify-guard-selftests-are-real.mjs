#!/usr/bin/env node
/**
 * GR-2 META-GUARD: does every guard's `--selftest` actually prove something?
 *
 * WHY THIS EXISTS (GO-TURBO-CC-2 WAVE-4 / GO-GR2-BASELINE item 2, 2026-08-29)
 * `scripts/verify-selftests-can-fail.mjs` already does a STATIC check on guards that define a named
 * `function selftest(...) { ... }`: it flags the body "inert" (calls neither the guard's own
 * assertion nor real repo source) or "fake-green" (collects problems, prints them, never exits
 * non-zero). Its heuristics are sound but its body-extraction only matches that one named-function
 * shape — a live census on this repo found only 1423 of 3658 `--selftest`-bearing guards use it; the
 * other ~2200 dispatch `--selftest` inline (`if (process.argv.includes("--selftest")) { ... }`) with
 * no `selftest()` function at all, so the sibling's extractor returns null for them and — by its own
 * documented contract ("no body → not inert, not fake-green") — silently treats every one of them as
 * real without ever inspecting what the block actually does. That gap is exactly the blind spot a
 * META-guard exists to close.
 *
 * This guard reimplements the same "inert / fake-green" contract (calls its own assertion or reads
 * real repo source; can exit non-zero; never collects problems and stays silent about it) but
 * extracts the body from EITHER shape — the named `function selftest` OR the first top-level
 * `if (...--selftest...) { ... }` block — using the same syntax-aware brace balancer the sibling
 * guard's own header credits for fixing an earlier truncation bug (`scripts/lib/brace-balance.mjs`).
 *
 * It then adds the dynamic half a static read can never prove: it actually RUNS
 * `node <guard> --selftest` for every guard, under the same no-reachable-database isolation
 * `verify-static.mjs` uses, and asserts the guard's own selftest currently exits zero on its real,
 * unmutated, currently-committed source — i.e. its planted-mutation self-test currently passes.
 *
 * A guard that fails the static half is "structurally fake" — the exact "printed SELFTEST PASS while
 * printing its own failures and exited 0" class the sibling guard's header describes, or a block that
 * never touches the guard's own check logic at all.
 * A guard that passes the static half (its selftest genuinely exercises real logic and can fail) but
 * fails the dynamic run is "currently broken" — a live self-detected regression, not a fake-green
 * report. Both are reported in their own bucket so neither class is silently folded into the other.
 *
 * RATCHET: `scripts/verify-guard-selftests-are-real-known-debt.json` lists guards that predate this
 * rule, split into `structurally_fake` and `currently_broken`. SHRINK-ONLY, same contract as the
 * sibling guard's own debt file. Run `--write-baseline` once to seed it.
 *
 * TWO-SPEED, same shape as verify-static-ratchet.mjs/verify-static.mjs: the dynamic half spawns a
 * child process per guard with `--selftest` (thousands of them), which takes minutes, not seconds —
 * unlike the sibling's pure-static scan, this cannot run on every push without breaking Rule 25
 * (fail-fast, seconds). So the DEFAULT (no-flag) invocation — the one wired into verify-steps and run
 * on every push — only checks that the committed debt-file baseline exists and is well-formed
 * (fast, no spawning, mirrors verify-static-ratchet.mjs's own git-show-and-compare pattern). The full
 * dynamic sweep across every guard runs ONLY on explicit `--full-scan` or `--write-baseline` — a
 * periodic, manually-triggered measurement, exactly like `npm run verify:static` itself is not wired
 * into the per-push chain either.
 *
 * Wired via `scripts/verify-steps/` only (Rule 17) — never `package.json`, `ci.yml`, or
 * `locked-guards.yml`.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findMatchingBraceEnd } from "./lib/brace-balance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const SELF_PATH = fileURLToPath(import.meta.url);
const SELF_NAME = path.basename(SELF_PATH);
const DEBT_FILE = path.join(SCRIPTS, "verify-guard-selftests-are-real-known-debt.json");
const LABEL = "verify-guard-selftests-are-real";
const WRITE_BASELINE = process.argv.includes("--write-baseline");
const FULL_SCAN = process.argv.includes("--full-scan") || WRITE_BASELINE;
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === SELF_PATH;

// ---------------------------------------------------------------------------------------------
// Static half: extract the --selftest body (either shape) and classify it.

/** Brace-balanced body of `function selftest(...) { ... }`, or null. */
function namedSelftestBody(source) {
  const m = /function\s+selftest\s*\([^)]*\)\s*\{/.exec(source);
  if (!m) return null;
  const openIndex = m.index + m[0].length - 1;
  return source.slice(m.index, findMatchingBraceEnd(source, openIndex));
}

/** Index one past the `)` matching the `(` at `openIndex`, walking naive paren depth (this repo's
 *  guard `if (...)` conditions do not contain string/regex literals with unbalanced parens — unlike
 *  brace matching, no syntax-aware skip is needed here). */
function findMatchingParenEnd(source, openIndex) {
  let depth = 1;
  let i = openIndex + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") depth--;
    i++;
  }
  return i;
}

/** Brace-balanced body of the first top-level `if (...--selftest...) { ... }` dispatch block, or
 *  null. Tolerates nested parens in the condition (e.g. `argv.includes('--selftest')`) and any
 *  condition shape, as long as the literal `--selftest` string appears inside the `if (...)` head. */
function inlineSelftestBody(source) {
  const re = /if\s*\(/g;
  let m;
  while ((m = re.exec(source))) {
    const openParen = m.index + m[0].length - 1;
    const closeParen = findMatchingParenEnd(source, openParen);
    const condition = source.slice(openParen, closeParen);
    if (!condition.includes("--selftest")) continue;
    const rest = source.slice(closeParen);
    const braceMatch = /^\s*\{/.exec(rest);
    if (!braceMatch) continue;
    const openBrace = closeParen + braceMatch[0].length - 1;
    return source.slice(m.index, findMatchingBraceEnd(source, openBrace));
  }
  return null;
}

/** Names of functions/consts defined at the top level of this guard file (same derivation as the
 *  sibling guard, kept name-agnostic so scan(), evaluate(), computeFailures()-style entrypoints are
 *  recognized, not only names starting with assert, check, or run. */
function declaredFunctionNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/gm)) names.add(m[1]);
  names.delete("selftest");
  return names;
}

/** True dispatch, not just the substring appearing in a comment/prose/string-compare elsewhere in
 *  the file (e.g. a guard that scans OTHER files for "--selftest" mentions it without exposing a
 *  --selftest mode of its own — verify-selftests-can-fail.mjs is exactly this shape). Requires an
 *  actual argv check: `argv.includes("--selftest")`, `argv.indexOf("--selftest")`, or equivalent. */
function hasRealSelftestDispatch(source) {
  return /\bargv\s*(?:\.includes\s*\(\s*["']--selftest["']\s*\)|\.indexOf\s*\(\s*["']--selftest["']\s*\))/.test(
    source,
  );
}

/** Static classification of a guard's --selftest body: is it structurally capable of failing?
 *  `unknown: true` (body shape not recognized — e.g. dispatched via an intermediate variable set
 *  far from its own `if`, a shape this extractor does not yet parse) is deliberately NOT the same
 *  as `inert: true`: an extractor miss must never be reported as a guard defect. Guards this static
 *  half cannot confidently read fall through to the dynamic-only check below. */
export function classifyStatic(source) {
  if (!hasRealSelftestDispatch(source)) return { hasSelftest: false };
  const body = namedSelftestBody(source) ?? inlineSelftestBody(source);
  if (!body) return { hasSelftest: true, unknown: true, inert: false, fakeGreen: false };

  const declared = declaredFunctionNames(source);
  const callsAssertion =
    /\b(assert\w*|check\w*|run\w*)\s*\(/.test(body) ||
    [...declared].some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`).test(body));
  const readsRepo = /\bread\s*\(|readFileSync\s*\(/.test(body);
  const canExitNonZero =
    /process\.exit\(1\)/.test(body) ||
    /process\.exitCode\s*=\s*1/.test(body) ||
    /\b(fail|die|bail|abort)\s*\(/.test(body) ||
    /\bthrow\b/.test(body);
  const collectsProblems = /(problems|failures|errors)\s*\.\s*push/.test(body);
  const fakeGreen = collectsProblems && !canExitNonZero;
  const inert = !callsAssertion && !readsRepo;

  return { hasSelftest: true, inert, fakeGreen };
}

// ---------------------------------------------------------------------------------------------
// Dynamic half: actually run `node <guard> --selftest`, isolated from any real database.

/** Same no-reachable-database isolation as verify-static.mjs's noDbEnv() — a static-sweep guard must
 *  never be able to reach a real Postgres, dev or prod, from this runner. Duplicated deliberately
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

/** Run `node <file> --selftest`, isolated from any real database, 20s timeout (selftest fixtures are
 *  in-process temp-dir work; anything slower is waiting on something it can't reach here). */
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

/** Classify one guard file: static-real + dynamic-pass, or the specific way it fails either. Pure
 *  w.r.t. the filesystem/child-process boundary passed in via options (testable without touching the
 *  real scripts/ directory). */
export function classifyOne(file, { readSource, runner = runSelftest } = {}) {
  const read = readSource ?? ((f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } });
  const src = read(file);
  const st = classifyStatic(src);
  if (!st.hasSelftest) return { hasSelftest: false };

  if (st.inert || st.fakeGreen) {
    return {
      hasSelftest: true,
      real: false,
      bucket: "structurally_fake",
      reason: st.fakeGreen
        ? "collects failures but never exits non-zero (fake-green)"
        : "selftest body calls neither the guard's own assertion nor real repo source (inert)",
    };
  }

  const dyn = runner(file);
  if (dyn.status !== 0) {
    const detail = dyn.timedOut
      ? "timed out (20s) — waiting on something unreachable in this isolated sweep"
      : dyn.spawnError
        ? `spawn error: ${dyn.spawnError.message}`
        : (dyn.out.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "").slice(0, 200);
    return { hasSelftest: true, real: false, bucket: "currently_broken", reason: detail };
  }

  return { hasSelftest: true, real: true };
}

/** Scan a directory of guard files. Returns { structurallyFake, currentlyBroken } name lists. */
export function scan({ dir = SCRIPTS, self = SELF_NAME, runner = runSelftest } = {}) {
  const structurallyFake = [];
  const currentlyBroken = [];
  const files = fs.readdirSync(dir).filter((f) => /^verify-.*\.mjs$/.test(f) && f !== self);
  for (const file of files) {
    const full = path.join(dir, file);
    const verdict = classifyOne(full, { runner });
    if (!verdict.hasSelftest || verdict.real) continue;
    if (verdict.bucket === "structurally_fake") structurallyFake.push(file);
    else currentlyBroken.push(file);
  }
  return { structurallyFake: structurallyFake.sort(), currentlyBroken: currentlyBroken.sort() };
}

// ---------------------------------------------------------------------------------------------
// Own planted-failure selftest (GO-TURBO-CC-2 WAVE-4: "a meta-guard with no selftest is the same
// bug one level up"). Two fixtures in a temp dir:
//   - a REAL guard: its --selftest plants a bad fixture, calls its own real check() against it, and
//     exits 1 if check() fails to flag it. Must be classified real:true.
//   - a FAKE-GREEN guard: its --selftest does nothing but print "PASS" and exit 0, never touching
//     any check logic. Must be classified real:false, bucket:"structurally_fake".
// If this guard ever stops distinguishing the two, its own selftest fails.
function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-guard-selftests-are-real-selftest-"));
  try {
    fs.writeFileSync(
      path.join(tmp, "verify-real-fixture.mjs"),
      [
        "function check(value) { return value === 'good'; }",
        "if (process.argv.includes('--selftest')) {",
        "  const bad = check('bad-planted-mutation');",
        "  const good = check('good');",
        "  if (bad !== false || good !== true) { console.error('selftest failed to catch the planted mutation'); process.exit(1); }",
        "  console.log('selftest OK'); process.exit(0);",
        "}",
        "console.log('normal run'); process.exit(0);",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(tmp, "verify-fakegreen-fixture.mjs"),
      [
        "if (process.argv.includes('--selftest')) {",
        "  console.log('SELFTEST PASS'); process.exit(0);",
        "}",
        "console.log('normal run'); process.exit(0);",
        "",
      ].join("\n"),
    );

    const real = classifyOne(path.join(tmp, "verify-real-fixture.mjs"));
    const fake = classifyOne(path.join(tmp, "verify-fakegreen-fixture.mjs"));

    const checks = [
      ["real fixture classified real:true", real.hasSelftest === true && real.real === true],
      [
        "fake-green fixture classified real:false/structurally_fake",
        fake.hasSelftest === true && fake.real === false && fake.bucket === "structurally_fake",
      ],
    ];
    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length) {
      console.error(`${LABEL} --selftest FAILED:`);
      for (const [name] of failed) console.error(`  ✗ ${name}`);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest OK — ${checks.length}/${checks.length} planted-fixture checks passed`);
    process.exit(0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Fast, no-spawning check for the default (per-push) invocation: the committed debt-file baseline
 *  must exist and be well-formed. This is what CI actually gates on every push; it does NOT re-run
 *  the expensive per-guard sweep (see the module header). Mirrors verify-static-ratchet.mjs's own
 *  "check the committed artifact, don't regenerate it" contract. */
function checkBaselineFast() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(DEBT_FILE, "utf8"));
  } catch (e) {
    console.error(
      `${LABEL} FAILED — ${path.basename(DEBT_FILE)} missing or invalid JSON (${e.message}). ` +
      `Run: node ${path.relative(ROOT, SELF_PATH)} --write-baseline`,
    );
    process.exit(1);
  }
  if (!Array.isArray(raw.structurally_fake) || !Array.isArray(raw.currently_broken)) {
    console.error(
      `${LABEL} FAILED — ${path.basename(DEBT_FILE)} is missing structurally_fake/currently_broken arrays.`,
    );
    process.exit(1);
  }
  console.log(
    `${LABEL} OK (baseline check) — ${raw.structurally_fake.length} structurally_fake + ` +
    `${raw.currently_broken.length} currently_broken tracked. Run with --full-scan for a fresh ` +
    `measurement (spawns every guard's --selftest; minutes, not seconds — not run on every push).`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
if (isDirectRun) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else if (!FULL_SCAN) {
    checkBaselineFast();
  } else {
    const { structurallyFake, currentlyBroken } = scan();

    if (WRITE_BASELINE) {
      fs.writeFileSync(
        DEBT_FILE,
        JSON.stringify(
          {
            note:
              "Guards whose --selftest predates verify-guard-selftests-are-real and is either " +
              "structurally fake (static: inert body, or fake-green — collects problems but never " +
              "exits non-zero) or currently broken (dynamic: `node <guard> --selftest` exits " +
              "non-zero today). RATCHET: this list may only SHRINK, split per bucket. Fix one, " +
              "remove its line.",
            structurally_fake: structurallyFake,
            currently_broken: currentlyBroken,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        `${LABEL}: baseline written — ${structurallyFake.length} structurally_fake, ${currentlyBroken.length} currently_broken`,
      );
      process.exit(0);
    }

    let debt = { structurally_fake: [], currently_broken: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(DEBT_FILE, "utf8"));
      debt = { structurally_fake: raw.structurally_fake ?? [], currently_broken: raw.currently_broken ?? [] };
    } catch {
      /* no baseline → everything is new */
    }
    const debtFake = new Set(debt.structurally_fake);
    const debtBroken = new Set(debt.currently_broken);

    const newFake = structurallyFake.filter((f) => !debtFake.has(f));
    const newBroken = currentlyBroken.filter((f) => !debtBroken.has(f));
    const fixedFake = debt.structurally_fake.filter((f) => !structurallyFake.includes(f));
    const fixedBroken = debt.currently_broken.filter((f) => !currentlyBroken.includes(f));

    if (fixedFake.length || fixedBroken.length) {
      console.log(
        `${LABEL}: ${fixedFake.length + fixedBroken.length} known-debt entr(y/ies) now FIXED — remove them from the baseline (shrink-only):`,
      );
      for (const f of fixedFake) console.log(`  ✓ fixed (structurally_fake): ${f}`);
      for (const f of fixedBroken) console.log(`  ✓ fixed (currently_broken): ${f}`);
    }

    const problems = [];
    if (newFake.length) {
      problems.push(
        `${newFake.length} NEW guard(s) with a structurally fake --selftest (unconditional pass, never exercises real logic):`,
        ...newFake.map((f) => `  ${f}`),
      );
    }
    if (newBroken.length) {
      problems.push(
        `${newBroken.length} NEW guard(s) whose real --selftest currently fails (node <guard> --selftest exits non-zero):`,
        ...newBroken.map((f) => `  ${f}`),
      );
    }

    if (problems.length) {
      console.error(`${LABEL} FAILED:`);
      for (const p of problems) console.error(p);
      process.exit(1);
    }

    console.log(
      `${LABEL} OK — no NEW structurally-fake or currently-broken selftests. ` +
      `${debtFake.size} structurally_fake + ${debtBroken.size} currently_broken pre-existing (tracked for burndown).`,
    );
  }
}
