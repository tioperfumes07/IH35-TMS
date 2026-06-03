import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

test("verify:drivers-reference-catalogs-wired passes on wired catalog pages", () => {
  const res = spawnSync("node", ["scripts/verify-drivers-reference-catalogs-wired.mjs"], {
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
