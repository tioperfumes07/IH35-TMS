import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("verify:no-active-drivers-mislabel passes on current banking pages", () => {
  const res = spawnSync("node", ["scripts/verify-no-active-drivers-mislabel.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /PASS/);
});
