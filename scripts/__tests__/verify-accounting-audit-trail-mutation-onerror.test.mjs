import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-accounting-audit-trail-mutation-onerror.mjs");
const stepPath = path.resolve(root, "scripts/verify-steps/944-verify-accounting-audit-trail-mutation-onerror.mjs");

function run(script, args = []) {
  return spawnSync("node", [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("verify:accounting-audit-trail-mutation-onerror --selftest passes", () => {
  const result = run(scriptPath, ["--selftest"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /verify:accounting-audit-trail-mutation-onerror --selftest PASS/);
});

test("verify:accounting-audit-trail-mutation-onerror passes on current tree", () => {
  const result = run(scriptPath);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /verify:accounting-audit-trail-mutation-onerror PASS/);
});

test("944 verify-step --selftest passes", () => {
  const result = run(stepPath, ["--selftest"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /944 verify-step --selftest PASS/);
});
