import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-accidents-wire-up.mjs");

function run(rootOverride) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_SAFETY_ACCIDENTS_ROOT: rootOverride ?? root,
    },
  });
}

test("passes when accidents page wiring is canonical", () => {
  const runResult = run();
  assert.equal(runResult.status, 0, runResult.stderr || runResult.stdout);
  assert.match(runResult.stdout, /verify:safety-accidents-wire-up OK/);
});

test("fails when accidents tab is not Live", () => {
  const fixtureRoot = path.resolve(root, "scripts/__tests__/fixtures/safety-accidents-wire-up/stub-tab");
  const runResult = run(fixtureRoot);
  assert.equal(runResult.status, 1);
  assert.match(runResult.stderr, /accidents tab must be Live/);
});
