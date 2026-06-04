import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.resolve(root, "scripts/verify-maint-create-vocab.mjs");

test("verify:maint-create-vocab passes on current tree", () => {
  const run = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /verify:maint-create-vocab PASS/);
});
