import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("verify:home-record-expense-modal passes on current home quick actions", () => {
  const res = spawnSync("node", ["scripts/verify-home-record-expense-modal.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /PASS/);
});
