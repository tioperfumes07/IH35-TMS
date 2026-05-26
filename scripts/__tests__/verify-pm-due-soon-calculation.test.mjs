import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-pm-due-soon-calculation.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/pm-due-soon-calculation");

function runFixture(name) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_PM_DUE_SOON_ROOT: root,
      VERIFY_PM_DUE_SOON_ROUTE_PATH: path.resolve(fixturesRoot, name, "pm-schedule.routes.ts"),
    },
  });
}

test("passes when due-soon thresholds are configurable", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:pm-due-soon-calculation OK/);
});

test("fails when env-backed thresholds are missing", () => {
  const run = runFixture("missing-env-threshold");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_miles_env_threshold/);
});
