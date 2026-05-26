import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-reports-coverage.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/safety-reports-coverage");

function runFixture(name) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_SAFETY_REPORTS_ROOT: path.resolve(fixturesRoot, name),
    },
  });
}

test("passes when report page and backend endpoints exist", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:safety-reports-coverage OK/);
});

test("fails when xlsx export route is missing", () => {
  const run = runFixture("missing-export");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_xlsx_export_route/);
});
