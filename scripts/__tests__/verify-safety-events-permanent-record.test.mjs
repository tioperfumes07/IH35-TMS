import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-events-permanent-record.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/safety-events-permanent-record");

function runFixture(name) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_SAFETY_EVENTS_PERMANENT_ROOT: path.resolve(fixturesRoot, name),
    },
  });
}

test("passes when permanent record columns and triggers exist", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:safety-events-permanent-record OK/);
});

test("fails when void columns are missing", () => {
  const run = runFixture("missing-void-columns");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_voided_at:safety\.accidents/);
});
