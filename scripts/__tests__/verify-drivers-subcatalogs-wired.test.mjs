import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

test("verify:drivers-subcatalogs-wired passes on wired tree", () => {
  const res = spawnSync("node", ["scripts/verify-drivers-subcatalogs-wired.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /PASS/);
});
