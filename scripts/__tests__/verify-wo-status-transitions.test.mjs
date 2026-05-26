import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-wo-status-transitions.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/wo-status-transitions");

function runWithFixture(fixtureName) {
  const fixtureRoot = path.resolve(fixturesRoot, fixtureName);
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_WO_STATUS_ROOT: root,
      VERIFY_WO_STATUS_ROUTE_PATH: path.resolve(fixtureRoot, "route.ts"),
      VERIFY_WO_STATUS_MIGRATION_PATH: path.resolve(fixtureRoot, "migration.sql"),
    },
  });
}

test("passes when WO transition policy and trigger patterns exist", () => {
  const run = runWithFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:wo-status-transitions OK/);
});

test("fails when open transition mapping is missing", () => {
  const run = runWithFixture("missing-open-transition");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_route_pattern:open-to-in-progress/);
});
