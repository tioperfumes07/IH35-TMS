import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-events-audit-chain.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/safety-events-audit-chain");

function runFixture(name) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_SAFETY_EVENTS_AUDIT_ROOT: path.resolve(fixturesRoot, name),
    },
  });
}

test("passes when route audit emissions are wired", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:safety-events-audit-chain OK/);
});

test("fails when audit emissions are missing", () => {
  const run = runFixture("missing-audit");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /insufficient_audit_emissions/);
});
