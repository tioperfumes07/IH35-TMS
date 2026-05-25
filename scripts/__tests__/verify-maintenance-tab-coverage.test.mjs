import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-maintenance-tab-coverage.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/maintenance-tab-coverage");

function runWithFixture(fixtureName) {
  const fixtureRoot = path.resolve(fixturesRoot, fixtureName);
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_MAINT_TAB_COVERAGE_ROOT: root,
      VERIFY_MAINT_TAB_COVERAGE_MANIFEST_PATH: path.resolve(fixtureRoot, "manifest.tsx"),
      VERIFY_MAINT_TAB_COVERAGE_DASHBOARD_PATH: path.resolve(fixtureRoot, "dashboard.routes.ts"),
    },
  });
}

test("passes when all tab routes and KPI endpoints are present", () => {
  const run = runWithFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:maintenance-tab-coverage OK/);
});

test("fails when a canonical maintenance tab route is missing", () => {
  const run = runWithFixture("missing-route");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_route:settings/);
});

test("fails when a required KPI endpoint is missing", () => {
  const run = runWithFixture("missing-kpi");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_kpi_endpoint:\/api\/v1\/maintenance\/parts-inventory\/kpis/);
});
