import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("verify:no-underscore-canonical-routes passes on current tree", () => {
  const res = spawnSync("node", ["scripts/verify-no-underscore-canonical-routes.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
