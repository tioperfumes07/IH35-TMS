import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("verify:a17-deprecation-comments exits 0 without DATABASE_DIRECT_URL", () => {
  const res = spawnSync("node", ["scripts/verify-a17-deprecation-comments.mjs"], {
    env: { ...process.env, DATABASE_DIRECT_URL: "" },
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
