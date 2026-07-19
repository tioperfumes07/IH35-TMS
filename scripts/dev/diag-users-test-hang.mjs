#!/usr/bin/env node
/**
 * DIAGNOSTIC ONLY — Users.test.tsx hang investigation (NOT a fix).
 *
 * Cloud agent (2026-07-19) could NOT reproduce a hang on current main against:
 *   - exact C5/pre-push guard command from scripts/verify-users-add-user-submits.mjs
 *   - npm run verify:users-add-user-submits
 *   - frontend-cwd vitest (apps/frontend vitest.config.ts + test-setup.ts)
 *
 * Run this LOCALLY when the hang is active. It prints evidence needed to fix the
 * root cause (which test stalls, whether frontend setupFiles load, open handles
 * after the summary, active resources if the child refuses to exit).
 *
 * Usage (repo root):
 *   node scripts/dev/diag-users-test-hang.mjs
 *   node scripts/dev/diag-users-test-hang.mjs --watchdog-ms 15000
 *   node scripts/dev/diag-users-test-hang.mjs --only-test "(f) returning"
 *   node scripts/dev/diag-users-test-hang.mjs --repeat 5
 *
 * Forbidden "fixes" this script intentionally does NOT apply:
 *   skip / .skip / timeout bumps / hook bypass / narrowing test selection in CI.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEST_REL = "apps/frontend/src/pages/Users.test.tsx";
const TEST_FE_REL = "src/pages/Users.test.tsx";

function parseArgs(argv) {
  const out = { watchdogMs: 20_000, repeat: 1, onlyTest: null, dumpSrc: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--watchdog-ms") out.watchdogMs = Number(argv[++i]);
    else if (a === "--repeat") out.repeat = Number(argv[++i]);
    else if (a === "--only-test") out.onlyTest = String(argv[++i] ?? "");
    else if (a === "--no-dump-src") out.dumpSrc = false;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/dev/diag-users-test-hang.mjs [--watchdog-ms N] [--repeat N] [--only-test SUBSTR]`);
      process.exit(0);
    }
  }
  return out;
}

function summarizeTimers(src, label) {
  const hits = [];
  const re = /setTimeout|setInterval|clearTimeout|clearInterval|refetchInterval|userEvent\.setup|vi\.useFakeTimers|waitFor\(/g;
  let m;
  while ((m = re.exec(src))) hits.push({ at: m.index, token: m[0] });
  console.log(`\n[diag] timer/async tokens in ${label}: ${hits.map((h) => h.token).join(", ") || "(none)"}`);
}

function dumpSuspectSources() {
  const toast = path.join(ROOT, "apps/frontend/src/components/Toast.tsx");
  const users = path.join(ROOT, "apps/frontend/src/pages/Users.tsx");
  const test = path.join(ROOT, TEST_REL);
  const setup = path.join(ROOT, "apps/frontend/src/test-setup.ts");
  for (const [label, p] of [
    ["Toast.tsx", toast],
    ["Users.tsx", users],
    ["Users.test.tsx", test],
    ["test-setup.ts", setup],
  ]) {
    if (!fs.existsSync(p)) {
      console.log(`[diag] MISSING ${label}: ${p}`);
      continue;
    }
    summarizeTimers(fs.readFileSync(p, "utf8"), label);
  }
  console.log(`
[diag] HYPOTHESIS CHECKLIST (inspect locally; do not treat as proven cause):
  1. Guard path runs from ROOT without apps/frontend/vitest.config.ts → setupFiles skipped
     (cloud measured "setup 0ms" on guard command; frontend-cwd shows ~80-90ms).
  2. ToastProvider schedules window.setTimeout(..., 4000) with NO clear on unmount
     (apps/frontend/src/components/Toast.tsx). Without RTL cleanup, timers can outlive tests.
  3. Users.tsx email debounce uses setTimeout(500) (cleared on effect cleanup) + bare
     setTimeout(100) for scrollIntoView after returning-dispatcher error (NOT cleared).
  4. QueryClient created per wrap() with no cancel/gc on unmount when setupFiles absent.
  5. waitFor assertions that never satisfy → fail after timeout (not infinite hang) unless
     fake timers are enabled without advanceTimers (Users.test does not enable fake timers).
`);
}

function runOnce(label, args, { cwd, watchdogMs, env = process.env }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let summaryAt = null;
    let lastLine = "";
    let setupMs = null;
    let testsMs = null;
    let durationMs = null;
    let stdout = "";
    let stderr = "";
    const child = spawn("npx", args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onChunk = (buf, isErr) => {
      const text = buf.toString();
      if (isErr) stderr += text;
      else stdout += text;
      process.stdout.write(`[${label}] ${text}`);
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        lastLine = line;
        const setupMatch = line.match(/setup\s+(\d+(?:\.\d+)?)m?s/i);
        if (setupMatch) setupMs = Number(setupMatch[1]);
        const testsMatch = line.match(/tests\s+(\d+(?:\.\d+)?)m?s/i);
        if (testsMatch) testsMs = Number(testsMatch[1]);
        const durMatch = line.match(/Duration\s+(\d+(?:\.\d+)?)s/);
        if (durMatch) durationMs = Math.round(Number(durMatch[1]) * 1000);
        if (/Test Files/.test(line) && summaryAt == null) summaryAt = Date.now();
      }
    };
    child.stdout.on("data", (b) => onChunk(b, false));
    child.stderr.on("data", (b) => onChunk(b, true));

    let watchdog = null;
    let hung = false;
    const armWatchdog = () => {
      if (watchdog) return;
      watchdog = setTimeout(() => {
        if (child.exitCode != null || child.killed) return;
        hung = true;
        console.error(`\n[diag] WATCHDOG: child still alive ${watchdogMs}ms after start (or after summary). Dumping signals.`);
        console.error(`[diag] lastLine=${JSON.stringify(lastLine)}`);
        console.error(`[diag] summaryAt=${summaryAt ? `${Date.now() - summaryAt}ms ago` : "never"}`);
        console.error(`[diag] Sending SIGUSR1 (Node may print stacks if --trace-*-warnings / inspector enabled).`);
        try {
          child.kill("SIGUSR1");
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          if (child.exitCode == null && !child.killed) {
            console.error(`[diag] Force SIGTERM after hang.`);
            child.kill("SIGTERM");
          }
        }, 2000);
      }, watchdogMs);
    };
    armWatchdog();

    // Re-arm a shorter watchdog once the summary prints — classic open-handle hang
    // is "tests green" then process never exits.
    const summaryWatcher = setInterval(() => {
      if (summaryAt && child.exitCode == null) {
        clearInterval(summaryWatcher);
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          if (child.exitCode != null || child.killed) return;
          hung = true;
          console.error(`\n[diag] POST-SUMMARY HANG: alive >3s after "Test Files" line.`);
          console.error(`[diag] Likely open handle (timer/server/worker). Re-run with:`);
          console.error(
            `  npx vitest run ${args.includes(TEST_FE_REL) ? TEST_FE_REL : TEST_REL} --reporter=default --reporter=hanging-process`
          );
          try {
            child.kill("SIGTERM");
          } catch {
            /* ignore */
          }
        }, 3000);
      }
    }, 100);

    child.on("close", (code, signal) => {
      clearTimeout(watchdog);
      clearInterval(summaryWatcher);
      const ended = Date.now();
      resolve({
        label,
        code,
        signal,
        hung,
        totalMs: ended - started,
        afterSummaryMs: summaryAt ? ended - summaryAt : null,
        setupMs,
        testsMs,
        durationMs,
        sawHangingProcessReport: /handle\(s\) keeping the process running/i.test(stdout + stderr),
        cwd,
        args,
      });
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`[diag] ROOT=${ROOT}`);
  console.log(`[diag] node=${process.version} platform=${process.platform} arch=${process.arch}`);
  console.log(`[diag] watchdogMs=${opts.watchdogMs} repeat=${opts.repeat} onlyTest=${opts.onlyTest ?? "(all)"}`);

  if (opts.dumpSrc) dumpSuspectSources();

  const filterArgs = opts.onlyTest ? ["-t", opts.onlyTest] : [];

  /** Exact C5 / verify-users-add-user-submits command (ROOT, no frontend config). */
  const guardCmd = ["vitest", "run", TEST_REL, "--reporter=verbose", ...filterArgs];
  /** Correct frontend project invocation (loads test-setup cleanup). */
  const feCmd = ["vitest", "run", TEST_FE_REL, "--reporter=verbose", ...filterArgs];
  /** Open-handle surface (pair with default so results still print). */
  const hangCmd = [
    "vitest",
    "run",
    TEST_REL,
    "--reporter=default",
    "--reporter=hanging-process",
    ...filterArgs,
  ];

  const results = [];
  for (let i = 1; i <= opts.repeat; i++) {
    console.log(`\n======== REPEAT ${i}/${opts.repeat} — GUARD PATH (exact verify script) ========`);
    results.push(await runOnce(`guard#${i}`, guardCmd, { cwd: ROOT, watchdogMs: opts.watchdogMs }));

    console.log(`\n======== REPEAT ${i}/${opts.repeat} — FRONTEND CWD (setupFiles loaded) ========`);
    results.push(
      await runOnce(`fe#${i}`, feCmd, {
        cwd: path.join(ROOT, "apps/frontend"),
        watchdogMs: opts.watchdogMs,
      })
    );
  }

  console.log(`\n======== OPEN-HANDLE PASS (guard path) ========`);
  results.push(await runOnce("hang-report", hangCmd, { cwd: ROOT, watchdogMs: opts.watchdogMs }));

  console.log(`\n======== DIAG SUMMARY ========`);
  for (const r of results) {
    console.log(
      JSON.stringify({
        label: r.label,
        code: r.code,
        signal: r.signal,
        hung: r.hung,
        totalMs: r.totalMs,
        afterSummaryMs: r.afterSummaryMs,
        setupMs: r.setupMs,
        testsMs: r.testsMs,
        durationMs: r.durationMs,
        sawHangingProcessReport: r.sawHangingProcessReport,
        cwd: r.cwd,
      })
    );
  }

  const anyHung = results.some((r) => r.hung || (r.afterSummaryMs ?? 0) > 2500);
  const guardSetupZero = results.some((r) => r.label.startsWith("guard") && r.setupMs === 0);
  console.log(`
[diag] INTERPRETATION
  - anyHung=${anyHung}
  - guardPathSetupZeroMs=${guardSetupZero}  (if true: ROOT guard is NOT loading apps/frontend/src/test-setup.ts)
  - If only guard path hangs and fe path exits clean: fix verify-users-add-user-submits.mjs to run
    from apps/frontend cwd (same as package.json "test" frontend slice) so cleanup() runs.
  - If hanging-process lists Timeout handles pointing at Toast.tsx: clear toast timers on unmount.
  - If a single -t test hangs: that test's waitFor/userEvent/debounce path is the deadlock.
  - Paste this full summary back into the cloud/agent thread before any code fix lands.
`);
  process.exit(anyHung ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
