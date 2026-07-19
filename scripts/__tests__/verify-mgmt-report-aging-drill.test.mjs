import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-mgmt-report-aging-drill.mjs");

function run(args = [], rootOverride) {
  return spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_MGMT_REPORT_AGING_DRILL_ROOT: rootOverride ?? root,
    },
  });
}

test("passes on current tree", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /verify-mgmt-report-aging-drill PASS/);
});

test("selftest planted failures pass", () => {
  const result = run(["--selftest"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /--selftest PASS/);
});
