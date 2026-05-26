import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-maintenance-routes-bootstrapped.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/maintenance-routes-bootstrapped");

function runFixture(name) {
  const fixtureRoot = path.resolve(fixturesRoot, name);
  const indexPath = path.resolve(fixtureRoot, "apps/backend/src/index.ts");
  const routesDir = path.resolve(fixtureRoot, "apps/backend/src/maintenance");
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_MAINTENANCE_ROUTES_INDEX_PATH: indexPath,
      VERIFY_MAINTENANCE_ROUTES_DIR: routesDir,
    },
  });
}

test("passes when all maintenance routes are imported and registered", () => {
  const run = runFixture("all-registered");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:maintenance-routes-bootstrapped OK/);
});

test("fails when one maintenance route file is not imported", () => {
  const run = runFixture("missing-one");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Missing imports/);
  assert.match(run.stderr, /c\.routes\.ts/);
});

test("fails when index registers a maintenance route module that does not exist", () => {
  const run = runFixture("extra-registered");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no matching file/);
  assert.match(run.stderr, /c\.routes\.js/);
});
