import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-rls-coverage.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/safety-rls-coverage");

function runFixture(name) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_SAFETY_RLS_ROOT: path.resolve(fixturesRoot, name),
    },
  });
}

test("passes when policies and scope helpers exist", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:safety-rls-coverage OK/);
});

test("fails when a table policy is missing", () => {
  const run = runFixture("missing-policy");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_tenant_policy:safety\.driver_safety_profiles/);
});
