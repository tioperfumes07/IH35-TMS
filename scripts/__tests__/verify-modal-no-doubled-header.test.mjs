import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const script = path.resolve(root, "scripts/verify-modal-no-doubled-header.mjs");
const fixtureRoot = path.resolve(root, "scripts/__tests__/fixtures/audit-visual-p1/modal-no-doubled-header");

test("fails shared Modal with inner h2", () => {
  const repo = path.resolve(root, ".tmp-modal-doubled-negative");
  spawnSync("rm", ["-rf", repo]);
  spawnSync("mkdir", ["-p", path.join(repo, "apps/frontend/src/components/work-orders")]);
  spawnSync("cp", [
    path.join(fixtureRoot, "negative/DoubledHeaderModal.tsx"),
    path.join(repo, "apps/frontend/src/components/work-orders/DoubledHeaderModal.tsx"),
  ]);
  const run = spawnSync("node", [script], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 1);
});

test("passes shared Modal without inner h2", () => {
  const repo = path.resolve(root, ".tmp-modal-doubled-positive");
  spawnSync("rm", ["-rf", repo]);
  spawnSync("mkdir", ["-p", path.join(repo, "apps/frontend/src/components/work-orders")]);
  spawnSync("cp", [
    path.join(fixtureRoot, "positive/SingleHeaderModal.tsx"),
    path.join(repo, "apps/frontend/src/components/work-orders/SingleHeaderModal.tsx"),
  ]);
  const run = spawnSync("node", [script], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 0);
});
