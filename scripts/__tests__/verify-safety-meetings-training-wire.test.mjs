import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-meetings-training-wire.mjs");

function run(rootOverride) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_SAFETY_MEETINGS_TRAINING_ROOT: rootOverride ?? root,
    },
  });
}

test("passes when meetings + training wiring is canonical", () => {
  const runResult = run();
  assert.equal(runResult.status, 0, runResult.stderr || runResult.stdout);
  assert.match(runResult.stdout, /verify:safety-meetings-training-wire OK/);
});

test("fails when safety-meetings tab is not Live", () => {
  const fixtureRoot = path.resolve(
    root,
    "scripts/__tests__/fixtures/safety-meetings-training-wire/stub-tab"
  );
  const runResult = run(fixtureRoot);
  assert.equal(runResult.status, 1);
  assert.match(runResult.stderr, /safety-meetings tab must be Live/);
});
