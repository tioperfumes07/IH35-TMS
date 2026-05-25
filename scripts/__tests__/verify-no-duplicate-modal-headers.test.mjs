import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const script = path.resolve(root, "scripts/verify-no-duplicate-modal-headers.mjs");
const fixtureRoot = path.resolve(root, "scripts/__tests__/fixtures/audit-visual-p1/no-duplicate-modal-headers");

test("fails duplicate modal headers", () => {
  const repo = path.resolve(root, ".tmp-dup-header-negative");
  spawnSync("rm", ["-rf", repo]);
  spawnSync("mkdir", ["-p", path.join(repo, "apps/frontend/src")]);
  spawnSync("cp", [path.join(fixtureRoot, "negative/BadModal.tsx"), path.join(repo, "apps/frontend/src/BadModal.tsx")]);
  const run = spawnSync("node", [script], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 1);
});

test("passes distinct modal headers", () => {
  const repo = path.resolve(root, ".tmp-dup-header-positive");
  spawnSync("rm", ["-rf", repo]);
  spawnSync("mkdir", ["-p", path.join(repo, "apps/frontend/src")]);
  spawnSync("cp", [path.join(fixtureRoot, "positive/GoodModal.tsx"), path.join(repo, "apps/frontend/src/GoodModal.tsx")]);
  const run = spawnSync("node", [script], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 0);
});
