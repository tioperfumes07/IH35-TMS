import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("verify:no-hardcoded-list-counts passes on current hub headers", () => {
  const res = spawnSync("node", ["scripts/verify-no-hardcoded-list-counts.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /PASS/);
});
