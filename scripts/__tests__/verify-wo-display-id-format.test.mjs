import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-wo-display-id-format.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/wo-display-id-format");

function runWithFixture(fixtureName) {
  const fixtureRoot = path.resolve(fixturesRoot, fixtureName);
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_WO_DISPLAY_ID_ROOT: root,
      VERIFY_WO_DISPLAY_ID_ROUTE_PATH: path.resolve(fixtureRoot, "route.ts"),
      VERIFY_WO_DISPLAY_ID_MIGRATION_PATH: path.resolve(fixtureRoot, "migration.sql"),
    },
  });
}

test("passes when WO display id format patterns are present", () => {
  const run = runWithFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:wo-display-id-format OK/);
});

test("fails when migration loses required PEND0 suffix segment", () => {
  const run = runWithFixture("missing-format");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_migration_pattern:pending-v5-fragment/);
});
