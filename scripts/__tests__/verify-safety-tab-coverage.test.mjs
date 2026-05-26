import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-tab-coverage.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/safety-tab-coverage");

function runFixture(name) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_SAFETY_TAB_ROOT: root,
      VERIFY_SAFETY_TAB_CONFIG_PATH: path.resolve(fixturesRoot, name, "SAFETY_TABS_CONFIG.ts"),
      VERIFY_SAFETY_TAB_BACKEND_PATH: path.resolve(fixturesRoot, name, "foundation-kpis.routes.ts"),
    },
  });
}

test("passes with complete safety coverage", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:safety-tab-coverage OK/);
});

test("fails when canonical tab coverage is missing", () => {
  const run = runFixture("missing-tab");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_tab_config:complaints/);
});
