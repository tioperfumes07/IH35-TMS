import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-posting-uses-skip-locked.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/posting-race");

function runFixture(targetFile) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_POSTING_SKIP_LOCKED_TARGET: path.resolve(fixturesRoot, targetFile),
    },
  });
}

test("passes when posting handler uses skip locked + idempotency conflict", () => {
  const run = runFixture("skip-locked-pass.ts");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:posting-uses-skip-locked: ok/);
});

test("fails when posting handler lacks required claim protections", () => {
  const run = runFixture("skip-locked-fail.ts");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /verify:posting-uses-skip-locked failed/);
});
