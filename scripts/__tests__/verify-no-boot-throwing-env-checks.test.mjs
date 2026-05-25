import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-no-boot-throwing-env-checks.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/no-boot-throwing-env-checks");

function runFixture(name) {
  return spawnSync("node", [scriptPath], {
    cwd: path.resolve(fixturesRoot, name),
    encoding: "utf8",
  });
}

test("passes legal hard_fail_at_boot fixture", () => {
  const run = runFixture("positive-pass");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:no-boot-throwing-env-checks: ok/);
});

test("fails illegal ad-hoc throw fixture", () => {
  const run = runFixture("negative-fail");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /env=TWILIO_ACCOUNT_SID/);
});

test("passes debt-exempt fixture and prints DEBT line", () => {
  const run = runFixture("debt-exempt");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /DEBT \(exempt until P7-AUDIT-P0-2-HOTFIX-2\): dist\/auth\/db\.js:IH35_BOOT_API_SMOKE/);
});

test("fails top-level Twilio eager constructor fixture", () => {
  const run = runFixture("twilio-eager");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /env=TWILIO_ACCOUNT_SID/);
});
