import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const script = path.resolve(root, "scripts/verify-no-seed-data-in-prod-fixtures.mjs");

test("fails when backend imports tests fixture path", () => {
  const repo = path.resolve(root, ".tmp-seed-negative");
  spawnSync("rm", ["-rf", repo]);
  fs.mkdirSync(path.join(repo, "apps/backend/src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "apps/backend/src/bad.ts"), 'import "../../tests/fixtures/a";\n');
  const run = spawnSync("node", [script], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 1);
});

test("passes when backend has no fixture imports", () => {
  const repo = path.resolve(root, ".tmp-seed-positive");
  spawnSync("rm", ["-rf", repo]);
  fs.mkdirSync(path.join(repo, "apps/backend/src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "apps/backend/src/good.ts"), "export const ok = true;\n");
  const run = spawnSync("node", [script], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 0);
});
