import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-migration-application-consistency.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/migration-application-consistency");

test("fails when migration-declared objects are missing", () => {
  const migrationsDir = path.resolve(fixturesRoot, "broken-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-empty.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /verify:migration-application-consistency FAILED/);
  assert.match(run.stderr, /table missing: qa\.test_table/);
});

test("passes when all migration-declared objects exist", () => {
  const migrationsDir = path.resolve(fixturesRoot, "ok-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-ok.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:migration-application-consistency OK/);
});
