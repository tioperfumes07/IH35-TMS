import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-maintenance-reports-coverage.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/maintenance-reports-coverage");

function runFixture(name) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_MAINT_REPORTS_ROOT: root,
      VERIFY_MAINT_REPORTS_BACKEND_PATH: path.resolve(fixturesRoot, name, "reports.routes.ts"),
      VERIFY_MAINT_REPORTS_FRONTEND_PATH: path.resolve(fixturesRoot, name, "MaintenanceReportsPage.tsx"),
    },
  });
}

test("passes when all required maintenance reports are covered", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:maintenance-reports-coverage OK/);
});

test("fails when one report is missing from frontend coverage", () => {
  const run = runFixture("missing-frontend-report");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_frontend_report:inspection_pass_fail_rate/);
});
