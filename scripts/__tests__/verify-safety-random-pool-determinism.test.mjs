import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-random-pool-determinism.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/safety-random-pool-determinism");

function runFixture(name) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_SAFETY_RANDOM_POOL_ROOT: path.resolve(fixturesRoot, name),
    },
  });
}

test("passes when random pool selection uses seed-only deterministic picker", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:safety-random-pool-determinism OK/);
});

test("fails when Math.random is used", () => {
  const run = runFixture("math-random");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /forbidden_math_random/);
});
