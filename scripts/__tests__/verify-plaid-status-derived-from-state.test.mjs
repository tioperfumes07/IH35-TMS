import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/verify-plaid-status-derived-from-state.mjs");

test("verify-plaid-status-derived-from-state passes on repo", () => {
  const run = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /verify:plaid-status-derived-from-state PASS/);
});
