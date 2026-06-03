import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

test("verify:oem-parts-no-touch-existing-parts-surfaces passes on B17 diff", () => {
  const res = spawnSync("node", ["scripts/verify-oem-parts-no-touch-existing-parts-surfaces.mjs"], {
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
