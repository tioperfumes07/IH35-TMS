import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-count-nav-integrity.mjs");

test("passes on canonical safety count/nav wiring", () => {
  const run = spawnSync("node", [scriptPath], { encoding: "utf8", cwd: root });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /verify-safety-count-nav-integrity.*OK/);
});
