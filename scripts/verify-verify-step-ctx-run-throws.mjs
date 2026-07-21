#!/usr/bin/env node
// verify:verify-step-ctx-run-throws
// Root-cause guard (Rule 18 — pipeline truth): scripts/verify-steps/_context.mjs
// `run()` MUST fail closed by THROWING on any non-zero child exit, and MUST expose
// a non-throwing `runAllowFailure()` for intentional probes.
//
// Why this exists (distinct from verify-verify-step-runner-return-status.mjs / step
// 948): step 948 proves the *runner* (_runner.mjs) fails closed when a step *returns*
// a non-zero number. It does NOT cover the far more common defect where a verify-step
// calls `ctx.run(...)` twice and DISCARDS the status — the child exits non-zero, the
// step returns undefined, and verify:pre-commit prints PASS. That fake-green is only
// closed when ctx.run() itself throws. This guard proves exactly that behavior and
// that runAllowFailure() stays non-throwing for probes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTEXT = path.join(ROOT, "scripts/verify-steps/_context.mjs");
const RUNNER = path.join(ROOT, "scripts/verify-steps/_runner.mjs");

// node -e programs used as deterministic, cwd-independent planted children.
const exitCmd = (code) => ["node", ["-e", `process.exit(${code})`]];
const SILENT = { stdio: "ignore" };

function assertThrowsSync(fn, pattern, label) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    if (pattern && !pattern.test(String(err?.message ?? err))) {
      throw new Error(`${label}: threw with unexpected message: ${err?.message ?? err}`);
    }
  }
  if (!threw) throw new Error(`${label}: expected throw, got none`);
}

async function assertRejects(fn, pattern, label) {
  let rejected = false;
  try {
    await fn();
  } catch (err) {
    rejected = true;
    if (pattern && !pattern.test(String(err?.message ?? err))) {
      throw new Error(`${label}: rejected with unexpected message: ${err?.message ?? err}`);
    }
  }
  if (!rejected) throw new Error(`${label}: expected rejection, got none`);
}

async function runChecks() {
  const failures = [];

  // ---- Source contract checks (fast, structural) ----
  const src = fs.readFileSync(CONTEXT, "utf8");
  if (!/const\s+runAllowFailure\s*=/.test(src)) {
    failures.push("_context.mjs must expose runAllowFailure() for intentional probes");
  }
  if (!/const\s+run\s*=/.test(src)) {
    failures.push("_context.mjs must expose run()");
  }
  if (!/command failed \(exit/.test(src) || !src.includes("throw new Error")) {
    failures.push("_context.mjs run() must throw with the failing command + exit status");
  }
  if (!/runAllowFailure,/.test(src)) {
    failures.push("_context.mjs must export runAllowFailure from the context object");
  }

  // ---- Behavioral proofs against the real context ----
  const { createVerifyPrecommitContext } = await import(pathToFileURL(CONTEXT).href);
  const { runStep } = await import(pathToFileURL(RUNNER).href);
  const ctx = createVerifyPrecommitContext(ROOT);

  // (success) run() returns 0 on a clean child and does not throw.
  try {
    const ok = ctx.run(...exitCmd(0), SILENT);
    assert.equal(ok, 0);
  } catch (err) {
    failures.push(`run() must not throw on exit 0: ${err.message}`);
  }

  // (a) run() throws on a planted non-zero child.
  try {
    assertThrowsSync(() => ctx.run(...exitCmd(7), SILENT), /exit 7/, "ctx.run non-zero");
  } catch (err) {
    failures.push(`run() must throw on non-zero exit: ${err.message}`);
  }

  // (a') run() throws when the command cannot be spawned at all.
  try {
    assertThrowsSync(
      () => ctx.run("ih35-nonexistent-command-xyz", [], SILENT),
      /could not spawn/,
      "ctx.run spawn failure",
    );
  } catch (err) {
    failures.push(`run() must throw when spawn fails: ${err.message}`);
  }

  // (b) runAllowFailure() returns the non-zero status WITHOUT throwing.
  try {
    const status = ctx.runAllowFailure(...exitCmd(4), SILENT);
    assert.equal(status, 4, `runAllowFailure returned ${status}, expected 4`);
  } catch (err) {
    failures.push(`runAllowFailure() must return non-zero status without throwing: ${err.message}`);
  }

  // (c) A step that ONLY calls ctx.run (no return, no status check) still fails
  //     closed through the runner when the child exits non-zero. This is the exact
  //     fake-green pattern the fix closes.
  const bareCtxRunStep = {
    name: "planted-bare-ctx-run-step",
    run: (c) => {
      c.run(...exitCmd(0), SILENT); // first sub-command passes
      c.run(...exitCmd(1), SILENT); // second fails — status is discarded by the step
    },
  };
  try {
    await assertRejects(
      () => runStep({ index: 1, total: 1, name: bareCtxRunStep.name, run: () => bareCtxRunStep.run(ctx) }),
      /exit 1/,
      "bare ctx.run step fail-closed",
    );
  } catch (err) {
    failures.push(`bare ctx.run step must fail closed through runStep: ${err.message}`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  // Prove the behavioral assertions actually catch a broken (non-throwing) context.
  // A fake run() that swallows non-zero (the OLD behavior) must be detected.
  const fakeCtx = {
    run: () => 9, // returns non-zero instead of throwing (the defect)
    runAllowFailure: () => 0, // wrong: reports success for a failing probe
  };
  assertThrowsSync(
    () => assertThrowsSync(() => fakeCtx.run(), /exit/, "inner"),
    /expected throw/,
    "selftest: non-throwing run must be flagged",
  );
  assert.notEqual(fakeCtx.runAllowFailure(), 4);
  console.log("verify:verify-step-ctx-run-throws --selftest PASS");
  process.exit(0);
}

const failures = await runChecks();
if (failures.length > 0) {
  console.error("verify:verify-step-ctx-run-throws FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("verify:verify-step-ctx-run-throws PASS");
