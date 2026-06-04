import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-hos-dashboard-wire.mjs");

function run(rootOverride) {
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_SAFETY_HOS_DASHBOARD_ROOT: rootOverride ?? root,
    },
  });
}

test("passes when safety HOS dashboard wiring is canonical", () => {
  const runResult = run();
  assert.equal(runResult.status, 0, runResult.stderr || runResult.stdout);
  assert.match(runResult.stdout, /verify:safety-hos-dashboard-wire OK/);
});
