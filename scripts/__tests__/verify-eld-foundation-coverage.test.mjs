import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-eld-foundation-coverage.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/verify-eld-foundation-coverage");

function runFixture(name) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_ELD_ROOT: root,
      VERIFY_ELD_TABS_CONFIG_PATH: path.resolve(fixturesRoot, name, "ELD_TABS_CONFIG.ts"),
      VERIFY_ELD_PAGE_PATH: path.resolve(fixturesRoot, name, "EldPage.tsx"),
      VERIFY_ELD_SIDEBAR_PATH: path.resolve(fixturesRoot, name, "sidebar-config.ts"),
      VERIFY_ELD_ROUTES_PATH: path.resolve(fixturesRoot, name, "manifest.tsx"),
    },
  });
}

test("passes with complete ELD foundation coverage", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:eld-foundation-coverage OK/);
});

test("fails when canonical ELD tab coverage is missing", () => {
  const run = runFixture("missing-tab");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_tab_id:settings/);
});
