import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("verify:drivers-catalogs-no-stub passes on wired catalog pages", () => {
  const res = spawnSync("node", ["scripts/verify-drivers-catalogs-no-stub.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
