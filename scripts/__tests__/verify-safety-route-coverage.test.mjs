import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-route-coverage.mjs");

function run(rootOverride) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_SAFETY_ROUTE_ROOT: rootOverride ?? root,
    },
  });
}

test("passes when all safety route modules are registered or deprecated", () => {
  const runResult = run();
  assert.equal(runResult.status, 0, runResult.stderr || runResult.stdout);
  assert.match(runResult.stdout, /verify:safety-route-coverage OK/);
});

test("fails when an unregistered safety route module lacks DEPRECATED marker", () => {
  const fixtureRoot = path.resolve(root, "scripts/__tests__/fixtures/safety-route-coverage/unmounted");
  const runResult = run(fixtureRoot);
  assert.equal(runResult.status, 1);
  assert.match(runResult.stderr, /neither registered in index.ts nor marked DEPRECATED/);
});
