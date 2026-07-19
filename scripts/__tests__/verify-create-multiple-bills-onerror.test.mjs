import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-create-multiple-bills-onerror.mjs");

function run(args = []) {
  return spawnSync("node", [scriptPath, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("verify:create-multiple-bills-onerror --selftest passes", () => {
  const result = run(["--selftest"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /verify:create-multiple-bills-onerror --selftest PASS/);
});

test("verify:create-multiple-bills-onerror passes on current tree", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /verify:create-multiple-bills-onerror PASS/);
});
