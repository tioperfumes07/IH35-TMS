import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-drivers-earnings-debt-tab.mjs");

function run(rootOverride) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_DRIVERS_EARNINGS_DEBT_ROOT: rootOverride ?? root,
    },
  });
}

test("passes when earnings & debt tab wiring is canonical", () => {
  const runResult = run();
  assert.equal(runResult.status, 0, runResult.stderr || runResult.stdout);
  assert.match(runResult.stdout, /verify:drivers-earnings-debt-tab OK/);
});

test("fails when earnings placeholder copy remains", () => {
  const fixtureRoot = path.resolve(root, "scripts/__tests__/fixtures/drivers-earnings-debt-tab/stub-placeholder");
  const runResult = run(fixtureRoot);
  assert.equal(runResult.status, 1);
  assert.match(runResult.stderr, /must not retain earnings placeholder copy/);
});
