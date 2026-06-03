import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("verify:names-master-no-new-tables passes", () => {
  const res = spawnSync("node", ["scripts/verify-names-master-no-new-tables.mjs"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
