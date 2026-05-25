import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-content-drift-check.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/content-drift-check");

test("passes when wrapped verify-content command has no drift", () => {
  const fixtureCommand = `sh "${path.resolve(fixturesRoot, "clean/run.sh")}"`;
  const run = spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_CONTENT_DRIFT_CHECK_COMMAND: fixtureCommand,
    },
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:content-drift-check OK/);
});

test("fails when wrapped verify-content command emits drift entries", () => {
  const fixtureCommand = `sh "${path.resolve(fixturesRoot, "with-drift/run.sh")}"`;
  const run = spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_CONTENT_DRIFT_CHECK_COMMAND: fixtureCommand,
    },
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /verify:content-drift-check FAILED/);
  assert.match(run.stderr, /DRIFT:/);
});
