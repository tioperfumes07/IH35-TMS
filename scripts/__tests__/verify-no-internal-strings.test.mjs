import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const script = path.resolve(root, "scripts/verify-no-internal-strings.mjs");
const fixtureRoot = path.resolve(root, "scripts/__tests__/fixtures/audit-visual-p1/no-internal-strings");

function runCase(kind) {
  const repo = path.resolve(root, `.tmp-internal-${kind}`);
  spawnSync("rm", ["-rf", repo]);
  spawnSync("mkdir", ["-p", path.join(repo, "apps/frontend/src")]);
  spawnSync("cp", [path.join(fixtureRoot, `${kind}/Internal.tsx`), path.join(repo, "apps/frontend/src/Internal.tsx")]);
  return spawnSync("node", [script], { cwd: repo, encoding: "utf8" });
}

test("fails internal string", () => assert.equal(runCase("negative").status, 1));
test("passes user-facing string", () => assert.equal(runCase("positive").status, 0));
