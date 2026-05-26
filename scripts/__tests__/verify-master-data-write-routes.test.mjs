import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-master-data-write-routes.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/master-data-write-routes");

function runFixture(fixtureName) {
  const fixtureRoot = path.resolve(fixturesRoot, fixtureName);
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_MASTER_DATA_WRITE_ROUTES_ROOT: fixtureRoot,
    },
  });
}

test("passes when all write routes are guarded", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:master-data-write-routes OK/);
});

test("fails when route misses audit emission pattern", () => {
  const run = runFixture("missing-audit");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_pattern:vehicles:appendCrudAudit/);
});
