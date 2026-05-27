import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-journal-entries-idempotency-key-required.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/posting-race");

function runFixture(targetFile) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_JE_IDEMPOTENCY_TARGET: path.resolve(fixturesRoot, targetFile),
    },
  });
}

test("passes when journal entry insert includes idempotency key + conflict guard", () => {
  const run = runFixture("je-idempotency-pass.ts");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:journal-entries-idempotency-key-required: ok/);
});

test("fails when journal entry insert omits idempotency protections", () => {
  const run = runFixture("je-idempotency-fail.ts");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /verify:journal-entries-idempotency-key-required failed/);
});
