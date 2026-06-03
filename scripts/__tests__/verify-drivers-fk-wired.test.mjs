import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

test("verify:drivers-fk-wired passes on wired migration and enrichment service", () => {
  const res = spawnSync("node", ["scripts/verify-drivers-fk-wired.mjs"], {
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
